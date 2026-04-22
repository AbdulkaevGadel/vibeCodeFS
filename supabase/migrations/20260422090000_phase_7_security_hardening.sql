-- Phase 7: RLS and SECURITY DEFINER hardening
--
-- Purpose:
-- - Restrict core support-domain reads to authenticated users that are registered managers.
-- - Keep direct table mutations blocked by the absence of permissive write policies.
-- - Recreate admin delete RPCs with explicit search_path protection.

-- 1. Replace broad SELECT policies with manager-only policies.

drop policy if exists "Managers can view all clients" on public.clients;
drop policy if exists "Managers can view all managers" on public.managers;
drop policy if exists "Managers can view all chats" on public.chats;
drop policy if exists "Managers can view all chat messages" on public.chat_messages;
drop policy if exists "Managers can view all chat assignments" on public.chat_assignments;
drop policy if exists "Managers can view all assignment history" on public.assignment_history;
drop policy if exists "Managers can view all status history" on public.chat_status_history;

create policy "Managers can view all clients" on public.clients
    for select to authenticated
    using (public.get_current_manager_id_safe_v1() is not null);

create policy "Managers can view all managers" on public.managers
    for select to authenticated
    using (public.get_current_manager_id_safe_v1() is not null);

create policy "Managers can view all chats" on public.chats
    for select to authenticated
    using (public.get_current_manager_id_safe_v1() is not null);

create policy "Managers can view all chat messages" on public.chat_messages
    for select to authenticated
    using (public.get_current_manager_id_safe_v1() is not null);

create policy "Managers can view all chat assignments" on public.chat_assignments
    for select to authenticated
    using (public.get_current_manager_id_safe_v1() is not null);

create policy "Managers can view all assignment history" on public.assignment_history
    for select to authenticated
    using (public.get_current_manager_id_safe_v1() is not null);

create policy "Managers can view all status history" on public.chat_status_history
    for select to authenticated
    using (public.get_current_manager_id_safe_v1() is not null);

-- 2. Recreate delete_message with search_path protection and activity recalculation.

create or replace function public.delete_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_manager_id uuid;
    v_manager_role text;
    v_chat_id uuid;
    v_last_message_at timestamptz;
begin
    v_manager_id := public.get_current_manager_id_safe_v1();

    if v_manager_id is null then
        raise exception 'Access denied';
    end if;

    select role
    into v_manager_role
    from public.managers
    where id = v_manager_id;

    if v_manager_role is distinct from 'admin' then
        raise exception 'Only admin can delete messages';
    end if;

    select chat_id
    into v_chat_id
    from public.chat_messages
    where id = p_message_id;

    if v_chat_id is null then
        raise exception 'Message not found';
    end if;

    perform 1
    from public.chats
    where id = v_chat_id
    for update;

    delete from public.chat_messages
    where id = p_message_id;

    select max(created_at)
    into v_last_message_at
    from public.chat_messages
    where chat_id = v_chat_id;

    update public.chats
    set
        last_message_at = v_last_message_at,
        updated_at = now()
    where id = v_chat_id;
end;
$$;

-- 3. Recreate delete_chat_admin with search_path protection and complete child cleanup.

create or replace function public.delete_chat_admin(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_manager_id uuid;
    v_manager_role text;
begin
    v_manager_id := public.get_current_manager_id_safe_v1();

    if v_manager_id is null then
        raise exception 'Access denied';
    end if;

    select role
    into v_manager_role
    from public.managers
    where id = v_manager_id;

    if v_manager_role is distinct from 'admin' then
        raise exception 'Only admin can delete chats';
    end if;

    perform 1
    from public.chats
    where id = p_chat_id
    for update;

    if not found then
        raise exception 'Chat not found';
    end if;

    delete from public.chat_messages
    where chat_id = p_chat_id;

    delete from public.assignment_history
    where chat_id = p_chat_id;

    delete from public.chat_status_history
    where chat_id = p_chat_id;

    delete from public.chat_assignments
    where chat_id = p_chat_id;

    delete from public.chats
    where id = p_chat_id;
end;
$$;
