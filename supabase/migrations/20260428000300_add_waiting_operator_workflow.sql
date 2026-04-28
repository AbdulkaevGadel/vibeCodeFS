-- Phase 4: add waiting_operator as a real chat workflow state.
-- This keeps AI handoff state backend-owned and preserves the existing RPC boundary.

alter table public.chats
    drop constraint chats_status_check;

alter table public.chats
    add constraint chats_status_check
    check (status in ('open', 'waiting_operator', 'in_progress', 'escalated', 'resolved', 'closed'));

alter table public.chat_status_history
    drop constraint chat_status_history_from_status_check;

alter table public.chat_status_history
    add constraint chat_status_history_from_status_check
    check (
        from_status is null
        or from_status in ('open', 'waiting_operator', 'in_progress', 'escalated', 'resolved', 'closed')
    );

alter table public.chat_status_history
    drop constraint chat_status_history_to_status_check;

alter table public.chat_status_history
    add constraint chat_status_history_to_status_check
    check (to_status in ('open', 'waiting_operator', 'in_progress', 'escalated', 'resolved', 'closed'));

create or replace function public.take_chat_into_work(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_auth_id uuid;
    v_manager_id uuid;
    v_manager_role varchar;
    v_current_status varchar;
    v_current_manager_id uuid;
    v_current_manager_name text;
begin
    v_auth_id := auth.uid();
    if v_auth_id is null then
        raise exception 'Аутентификация обязательна';
    end if;

    select id, role
    into v_manager_id, v_manager_role
    from public.managers
    where auth_user_id = v_auth_id;

    if v_manager_id is null then
        raise exception 'Менеджер не найден';
    end if;

    select status
    into v_current_status
    from public.chats
    where id = p_chat_id
    for update;

    if not found then
        raise exception 'Чат не найден';
    end if;

    if v_current_status not in ('open', 'waiting_operator') then
        raise exception 'Этот чат нельзя взять в работу из текущего статуса';
    end if;

    select ca.current_manager_id, m.display_name
    into v_current_manager_id, v_current_manager_name
    from public.chat_assignments ca
    left join public.managers m on m.id = ca.current_manager_id
    where ca.chat_id = p_chat_id
    for update;

    if v_current_manager_id is not null and v_current_manager_id != v_manager_id then
        raise exception 'Чат уже занят менеджером %', coalesce(v_current_manager_name, 'другим сотрудником');
    end if;

    if v_current_manager_id is null then
        insert into public.assignment_history (
            chat_id,
            from_manager_id,
            to_manager_id,
            assigned_by_manager_id
        ) values (
            p_chat_id,
            null,
            v_manager_id,
            v_manager_id
        );

        insert into public.chat_assignments (
            chat_id,
            current_manager_id,
            assigned_by_manager_id,
            updated_at
        ) values (
            p_chat_id,
            v_manager_id,
            v_manager_id,
            now()
        )
        on conflict (chat_id) do update
        set
            current_manager_id = excluded.current_manager_id,
            assigned_by_manager_id = excluded.assigned_by_manager_id,
            updated_at = now();
    end if;

    if v_current_status in ('open', 'waiting_operator') then
        insert into public.chat_status_history (
            chat_id,
            from_status,
            to_status,
            changed_by_manager_id
        ) values (
            p_chat_id,
            v_current_status,
            'in_progress',
            v_manager_id
        );

        update public.chats
        set
            status = 'in_progress',
            updated_at = now()
        where id = p_chat_id;
    end if;
end;
$$;

create or replace function public.update_chat_status(
    p_chat_id uuid,
    p_new_status varchar,
    p_expected_status varchar default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_current_manager_id uuid;
    v_manager_role varchar;
    v_old_status varchar;
begin
    select id, role
    into v_current_manager_id, v_manager_role
    from public.managers
    where auth_user_id = auth.uid();

    if v_current_manager_id is null then
        raise exception 'Профиль менеджера не найден';
    end if;

    if p_new_status not in ('open', 'waiting_operator', 'in_progress', 'escalated', 'resolved', 'closed') then
        raise exception 'Недопустимый статус чата';
    end if;

    select status
    into v_old_status
    from public.chats
    where id = p_chat_id
    for update;

    if not found then
        raise exception 'Чат не найден';
    end if;

    if p_expected_status is not null and v_old_status is distinct from p_expected_status then
        raise exception 'Данные в интерфейсе устарели. Пожалуйста, попробуйте еще раз.';
    end if;

    if v_old_status = p_new_status then
        return;
    end if;

    if v_old_status in ('resolved', 'closed') and p_new_status = 'waiting_operator' then
        raise exception 'Сначала откройте завершённый чат';
    end if;

    if v_manager_role = 'support' then
        if v_old_status = 'escalated' then
            raise exception 'Обычный саппорт не может изменить статус эскалированного чата';
        end if;

        if p_new_status = 'waiting_operator' then
            raise exception 'Обычный саппорт не может перевести чат в waiting_operator';
        end if;

        if not exists (
            select 1
            from public.chat_assignments
            where chat_id = p_chat_id
              and current_manager_id = v_current_manager_id
        ) then
            raise exception 'Вы можете менять статус только назначенного на вас чата';
        end if;
    end if;

    if p_new_status in ('open', 'waiting_operator') then
        delete from public.chat_assignments
        where chat_id = p_chat_id;
    end if;

    update public.chats
    set
        status = p_new_status,
        updated_at = now()
    where id = p_chat_id;

    insert into public.chat_status_history (
        chat_id,
        from_status,
        to_status,
        changed_by_manager_id
    ) values (
        p_chat_id,
        v_old_status,
        p_new_status,
        v_current_manager_id
    );
end;
$$;

comment on function public.take_chat_into_work(uuid)
    is 'Claims a free open/waiting_operator chat and moves it to in_progress.';

comment on function public.update_chat_status(uuid, varchar, varchar)
    is 'Updates chat lifecycle status with role checks, optimistic locking, and waiting_operator workflow rules.';
