-- Wave 18 rollback: revert AI orchestration foundation
-- Purpose:
-- 1. Remove chat_ai_runs foundation table.
-- 2. Remove waiting_operator from status model.
-- 3. Restore chat_messages sender_type constraints to client/manager only.
-- 4. Restore take_chat_into_work behavior without waiting_operator.

-- 0. Restore the single affected chat back to its previous business state.
update public.chats
set status = 'in_progress',
    updated_at = now()
where id = 'fd916b39-1dcd-41f3-b901-4157dccf2f5a'
  and status = 'waiting_operator';

-- Remove status history entries introduced by waiting_operator before restoring old constraints.
delete from public.chat_status_history
where from_status = 'waiting_operator'
   or to_status = 'waiting_operator';

-- 1. Remove AI orchestration execution table.
drop table if exists public.chat_ai_runs;

-- 2. Restore sender_type constraints.
alter table public.chat_messages
    drop constraint if exists chat_messages_sender_type_check;

alter table public.chat_messages
    add constraint chat_messages_sender_type_check
        check (sender_type in ('client', 'manager'));

alter table public.chat_messages
    drop constraint if exists chat_messages_sender_manager_consistency_check;

alter table public.chat_messages
    add constraint chat_messages_sender_manager_consistency_check
        check (
            (sender_type = 'manager' and manager_id is not null)
            or
            (sender_type = 'client' and manager_id is null)
        );

-- 3. Restore old chat status model.
alter table public.chats
    drop constraint if exists chats_status_check;

alter table public.chats
    add constraint chats_status_check
        check (status in ('open', 'in_progress', 'escalated', 'resolved', 'closed'));

alter table public.chat_status_history
    drop constraint if exists chat_status_history_from_status_check;

alter table public.chat_status_history
    add constraint chat_status_history_from_status_check
        check (
            from_status is null
            or from_status in ('open', 'in_progress', 'escalated', 'resolved', 'closed')
        );

alter table public.chat_status_history
    drop constraint if exists chat_status_history_to_status_check;

alter table public.chat_status_history
    add constraint chat_status_history_to_status_check
        check (to_status in ('open', 'in_progress', 'escalated', 'resolved', 'closed'));

-- 4. Restore take_chat_into_work without waiting_operator awareness.
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
        raise exception 'Запись менеджера не найдена';
    end if;

    select status
    into v_current_status
    from public.chats
    where id = p_chat_id
    for update;

    if not found then
        raise exception 'Чат не найден';
    end if;

    if v_current_status = 'escalated' and v_manager_role = 'support' then
        raise exception 'У вас недостаточно прав для изменения чата в статусе escalated';
    end if;

    select ca.current_manager_id
    into v_current_manager_id
    from public.chat_assignments ca
    where ca.chat_id = p_chat_id
    for update;

    if v_current_manager_id is not null then
        select m.display_name
        into v_current_manager_name
        from public.managers m
        where m.id = v_current_manager_id;
    end if;

    if v_current_manager_id is not null and v_current_manager_id != v_manager_id then
        raise exception 'Чат уже занят менеджером %', coalesce(v_current_manager_name, 'другим сотрудником');
    end if;

    if v_current_manager_id is null or v_current_manager_id != v_manager_id then
        insert into public.assignment_history (
            chat_id,
            from_manager_id,
            to_manager_id,
            assigned_by_manager_id
        ) values (
            p_chat_id,
            v_current_manager_id,
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

    if v_current_status = 'open' then
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
    end if;

    update public.chats
    set
        status = case when status = 'open' then 'in_progress' else status end,
        updated_at = now()
    where id = p_chat_id;
end;
$$;
