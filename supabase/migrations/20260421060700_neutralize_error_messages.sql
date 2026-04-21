-- Wave 17 (Neutral Messages): Sanitize Error Outputs
-- Re-defines hardened functions with user-friendly error messages instead of technical codes.

-- 1. transfer_chat
create or replace function public.transfer_chat(
    p_chat_id uuid, 
    p_target_manager_id uuid,
    p_expected_from_manager_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_auth_id uuid;
    v_manager_id uuid;
    v_manager_role varchar;
    v_current_manager_id uuid;
begin
    v_auth_id := auth.uid();
    select id, role into v_manager_id, v_manager_role from public.managers where auth_user_id = v_auth_id;
    if v_manager_id is null then raise exception 'Менеджер не найден'; end if;

    select current_manager_id into v_current_manager_id 
    from public.chat_assignments where chat_id = p_chat_id for update;

    if p_expected_from_manager_id is not null and v_current_manager_id is distinct from p_expected_from_manager_id then
        raise exception 'Данные в интерфейсе устарели. Пожалуйста, попробуйте еще раз.';
    end if;

    if v_manager_role = 'support' and v_current_manager_id is distinct from v_manager_id then
        raise exception 'Вы можете передавать только те чаты, на которые назначены сами';
    end if;

    if p_target_manager_id = v_current_manager_id then return; end if;

    insert into public.assignment_history (chat_id, from_manager_id, to_manager_id, assigned_by_manager_id)
    values (p_chat_id, v_current_manager_id, p_target_manager_id, v_manager_id);

    insert into public.chat_assignments (chat_id, current_manager_id, assigned_by_manager_id, updated_at)
    values (p_chat_id, p_target_manager_id, v_manager_id, now())
    on conflict (chat_id) do update set
        current_manager_id = excluded.current_manager_id,
        assigned_by_manager_id = excluded.assigned_by_manager_id,
        updated_at = now();

    update public.chats set updated_at = now() where id = p_chat_id;
end;
$$;

-- 2. update_chat_status
create or replace function public.update_chat_status(
    p_chat_id uuid,
    p_new_status varchar,
    p_expected_status varchar default null
) returns void as $$
declare
    v_current_manager_id uuid;
    v_manager_role varchar;
    v_old_status varchar;
begin
    select id, role into v_current_manager_id, v_manager_role from public.managers where auth_user_id = auth.uid();
    if not found then raise exception 'Профиль менеджера не найден'; end if;

    select status into v_old_status from public.chats where id = p_chat_id for update;
    if not found then raise exception 'Чат не найден'; end if;

    if p_expected_status is not null and v_old_status is distinct from p_expected_status then
        raise exception 'Данные в интерфейсе устарели. Пожалуйста, попробуйте еще раз.';
    end if;

    if v_old_status = 'escalated' and v_manager_role = 'support' then
        raise exception 'Обычный саппорт не может изменить статус эскалированного чата';
    end if;

    if v_old_status = p_new_status then return; end if;

    if p_new_status = 'open' and v_manager_role not in ('admin', 'supervisor') then
        raise exception 'Только администраторы могут переоткрывать чаты';
    end if;

    if p_new_status = 'open' then
        delete from public.chat_assignments where chat_id = p_chat_id;
    end if;

    update public.chats set status = p_new_status, updated_at = now() where id = p_chat_id;

    insert into public.chat_status_history (chat_id, from_status, to_status, changed_by_manager_id)
    values (p_chat_id, v_old_status, p_new_status, v_current_manager_id);
end;
$$ language plpgsql security definer set search_path = public;

-- 3. resolve_chat
create or replace function public.resolve_chat(
    p_chat_id uuid,
    p_expected_status varchar default null
)
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
begin
    v_auth_id := auth.uid();
    if v_auth_id is null then raise exception 'Аутентификация обязательна'; end if;

    select id, role into v_manager_id, v_manager_role from public.managers where auth_user_id = v_auth_id;
    if v_manager_id is null then raise exception 'Менеджер не найден'; end if;

    select status into v_current_status from public.chats where id = p_chat_id for update;
    if not found then raise exception 'Чат не найден'; end if;

    if p_expected_status is not null and v_current_status is distinct from p_expected_status then
        raise exception 'Данные в интерфейсе устарели. Пожалуйста, попробуйте еще раз.';
    end if;

    if v_current_status in ('closed', 'resolved') then raise exception 'Чат уже завершен'; end if;

    if v_manager_role = 'support' then
        if not exists (select 1 from public.chat_assignments where chat_id = p_chat_id and current_manager_id = v_manager_id) then
            raise exception 'Вы не назначены на этот чат, завершить его не можете';
        end if;
    end if;

    insert into public.chat_status_history (chat_id, from_status, to_status, changed_by_manager_id)
    values (p_chat_id, v_current_status, 'resolved', v_manager_id);

    update public.chats set status = 'resolved', updated_at = now() where id = p_chat_id;
end;
$$;
