-- Wave 17 (Hardened): Optimistic Locking for Resolve
-- Adds p_expected_status to resolve_chat to prevent race conditions.

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
    -- 1. Идентификация
    v_auth_id := auth.uid();
    if v_auth_id is null then raise exception 'Аутентификация обязательна'; end if;

    select id, role into v_manager_id, v_manager_role from public.managers where auth_user_id = v_auth_id;
    if v_manager_id is null then raise exception 'Менеджер не найден'; end if;

    -- 2. Блокировка и проверка
    select status into v_current_status from public.chats where id = p_chat_id for update;
    if not found then raise exception 'Чат не найден'; end if;

    -- OPTIMISTIC LOCKING
    if p_expected_status is not null and v_current_status is distinct from p_expected_status then
        raise exception 'CONFLICT_STALE_DATA: Статус чата уже был изменен другим менеджером';
    end if;

    if v_current_status in ('closed', 'resolved') then
        raise exception 'Чат уже завершен';
    end if;

    -- 3. Проверка прав (разрешить только назначенному или админу/супервайзеру)
    if v_manager_role = 'support' then
        if not exists (select 1 from public.chat_assignments where chat_id = p_chat_id and current_manager_id = v_manager_id) then
            raise exception 'Вы не назначены на этот чат, завершить его не можете';
        end if;
    end if;

    -- 4. Смена статуса
    insert into public.chat_status_history (
        chat_id, from_status, to_status, changed_by_manager_id
    ) values (
        p_chat_id, v_current_status, 'resolved', v_manager_id
    );

    update public.chats 
    set status = 'resolved', updated_at = now() 
    where id = p_chat_id;
end;
$$;
