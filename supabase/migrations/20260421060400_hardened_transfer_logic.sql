-- Wave 17 (Hardened): Optimistic Locking for Transfers
-- Adds p_expected_from_manager_id to prevent race conditions during chat transfers.

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
    v_current_manager_name text;
begin
    -- 1. Идентификация инициатора (кто делает трансфер)
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

    -- 2. Блокировка и проверка текущего состояния
    -- Блокируем запись назначения для атомарной проверки
    select current_manager_id into v_current_manager_id 
    from public.chat_assignments 
    where chat_id = p_chat_id 
    for update;

    -- OPTIMISTIC LOCKING: Проверка на соответствие ожидаемому состоянию
    -- Если фронтенд прислал ожидаемого менеджера, и он не совпадает с тем, что в базе - отмена.
    if p_expected_from_manager_id is not null and v_current_manager_id is distinct from p_expected_from_manager_id then
        raise exception 'CONFLICT_STALE_DATA: Чат уже был передан или изменен другим менеджером';
    end if;

    -- 3. Проверка прав (Бизнес-логика)
    -- Support-менеджер может передавать только СВОИ чаты.
    -- Admin/Supervisor может передавать ЛЮБЫЕ чаты.
    if v_manager_role = 'support' and v_current_manager_id is distinct from v_manager_id then
        raise exception 'Вы можете передавать только те чаты, на которые назначены сами';
    end if;

    -- Нельзя передать самому себе (бессмысленно)
    if p_target_manager_id = v_current_manager_id then
        return;
    end if;

    -- 4. Запись истории перемещения
    insert into public.assignment_history (
        chat_id,
        from_manager_id,
        to_manager_id,
        assigned_by_manager_id
    ) values (
        p_chat_id,
        v_current_manager_id,
        p_target_manager_id,
        v_manager_id
    );

    -- 5. Обновление текущего назначения
    insert into public.chat_assignments (
        chat_id,
        current_manager_id,
        assigned_by_manager_id,
        updated_at
    ) values (
        p_chat_id,
        p_target_manager_id,
        v_manager_id,
        now()
    )
    on conflict (chat_id) do update
    set
        current_manager_id = excluded.current_manager_id,
        assigned_by_manager_id = excluded.assigned_by_manager_id,
        updated_at = now();

    -- 6. Realtime Touch: Всегда обновляем updated_at в главной таблице chats
    update public.chats
    set updated_at = now()
    where id = p_chat_id;

end;
$$;
