-- Phase 4 fix: avoid FOR UPDATE on the nullable side of an outer join.
-- PostgreSQL does not allow FOR UPDATE against nullable rows produced by LEFT JOIN.

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

    select current_manager_id
    into v_current_manager_id
    from public.chat_assignments
    where chat_id = p_chat_id
    for update;

    if v_current_manager_id is not null and v_current_manager_id != v_manager_id then
        select display_name
        into v_current_manager_name
        from public.managers
        where id = v_current_manager_id;

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
end;
$$;

comment on function public.take_chat_into_work(uuid)
    is 'Claims a free open/waiting_operator chat and moves it to in_progress.';
