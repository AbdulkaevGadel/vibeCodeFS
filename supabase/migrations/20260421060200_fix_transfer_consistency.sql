-- Wave 17: Fix Realtime consistency for chat transfers and take-into-work
-- Ensures that public.chats.updated_at is always updated, triggering Realtime events for the UI.

-- 1. Update transfer_chat
create or replace function public.transfer_chat(
    p_chat_id uuid,
    p_target_manager_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_auth_id uuid;
    v_from_manager_id uuid;
    v_current_manager_id uuid;
    v_manager_role varchar;
begin
    -- 1. Идентификация отправителя
    v_auth_id := auth.uid();
    select id, role into v_from_manager_id, v_manager_role from public.managers where auth_user_id = v_auth_id;
    if v_from_manager_id is null then raise exception 'Менеджер не найден'; end if;

    -- 2. Проверка прав на трансфер
    select current_manager_id into v_current_manager_id 
    from public.chat_assignments where chat_id = p_chat_id for update;

    if v_manager_role = 'support' and v_current_manager_id is distinct from v_from_manager_id then
        raise exception 'Вы можете передавать только те чаты, на которые назначены сами';
    end if;

    -- 3. Проверка существования целевого менеджера
    if not exists (select 1 from public.managers where id = p_target_manager_id) then
        raise exception 'Целевой менеджер не найден';
    end if;

    -- 4. Запись истории назначения
    insert into public.assignment_history (
        chat_id, from_manager_id, to_manager_id, assigned_by_manager_id
    ) values (
        p_chat_id, v_current_manager_id, p_target_manager_id, v_from_manager_id
    );

    -- 5. Обновление текущего назначения
    insert into public.chat_assignments (
        chat_id, current_manager_id, assigned_by_manager_id, updated_at
    ) values (
        p_chat_id, p_target_manager_id, v_from_manager_id, now()
    )
    on conflict (chat_id) do update 
    set 
        current_manager_id = excluded.current_manager_id,
        assigned_by_manager_id = excluded.assigned_by_manager_id,
        updated_at = now();

    -- 6. КРИТИЧЕСКИЙ ФИКС: Безусловное обновление chats для Realtime
    -- Переводим в in_progress если был open, иначе просто обновляем updated_at
    update public.chats 
    set 
        status = case when status = 'open' then 'in_progress' else status end,
        updated_at = now() 
    where id = p_chat_id;

end;
$$;

-- 2. Update take_chat_into_work
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
    -- 1. Идентификация вызывающего менеджера
    v_auth_id := auth.uid();
    if v_auth_id is null then
        raise exception 'Аутентификация обязательна';
    end if;

    select id, role
    into v_manager_id, v_manager_role
    from public.managers
    where auth_user_id = v_auth_id;

    if v_manager_id is null then
        raise exception 'Запись менеджера не найдена для данного пользователя';
    end if;

    -- 2. Блокировка чата для атомарного изменения
    select status
    into v_current_status
    from public.chats
    where id = p_chat_id
    for update;

    if not found then
        raise exception 'Чат не найден';
    end if;

    -- 3. Проверка прав (Support не может брать Эскалированные чаты)
    if v_current_status = 'escalated' and v_manager_role = 'support' then
        raise exception 'У вас недостаточно прав для изменения чата в статусе escalated';
    end if;

    -- 4. Проверка текущего назначения
    select ca.current_manager_id, m.display_name
    into v_current_manager_id, v_current_manager_name
    from public.chat_assignments ca
    left join public.managers m on m.id = ca.current_manager_id
    where ca.chat_id = p_chat_id
    for update;

    -- Если чат уже занят другим менеджером - запрещаем захват
    if v_current_manager_id is not null and v_current_manager_id != v_manager_id then
        raise exception 'Чат уже занят менеджером %', coalesce(v_current_manager_name, 'другим сотрудником');
    end if;

    -- 5. Логика назначения
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

    -- 6. КРИТИЧЕСКИЙ ФИКС: Безусловное обновление chats для Realtime
    -- Даже если чат уже был in_progress, обновляем updated_at для уведомления других клиентов
    update public.chats
    set
        status = case when status = 'open' then 'in_progress' else status end,
        updated_at = now()
    where id = p_chat_id;

end;
$$;
