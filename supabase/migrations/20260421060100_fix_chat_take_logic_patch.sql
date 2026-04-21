-- Wave 17 (Patch): Fix chat assignment JOIN error
-- Re-implements take_chat_into_work without the invalid FOR UPDATE on an outer join.

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
    -- 1. Идентификация
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

    -- 2. Блокировка чата
    select status
    into v_current_status
    from public.chats
    where id = p_chat_id
    for update;

    if not found then
        raise exception 'Чат не найден';
    end if;

    -- 3. Проверка прав (Support vs Escalated)
    if v_current_status = 'escalated' and v_manager_role = 'support' then
        raise exception 'У вас недостаточно прав для эскалированного чата';
    end if;

    -- 4. Проверка текущего назначения (SAFE WAY)
    -- Сначала блокируем только ca, чтобы избежать ошибки "FOR UPDATE cannot be applied to the nullable side of an outer join"
    select ca.current_manager_id
    into v_current_manager_id
    from public.chat_assignments ca
    where ca.chat_id = p_chat_id
    for update;

    -- Если чат уже занят - вытягиваем имя менеджера для ошибки
    if v_current_manager_id is not null then
        select m.display_name
        into v_current_manager_name
        from public.managers m
        where m.id = v_current_manager_id;
    end if;

    -- ❗ БЛОКИРОВКА ПЕРЕХВАТА: Если чат занят другим менеджером
    if v_current_manager_id is not null and v_current_manager_id != v_manager_id then
        raise exception 'Чат уже занят менеджером %', coalesce(v_current_manager_name, 'другим сотрудником');
    end if;

    -- 5. Назначение (если свободен или свой)
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

    -- 6. Смена статуса
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

        update public.chats
        set
            status = 'in_progress',
            updated_at = now()
        where id = p_chat_id;
    end if;

end;
$$;
