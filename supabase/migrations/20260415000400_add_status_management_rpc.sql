-- RPC для ручного управления статусами чата
CREATE OR REPLACE FUNCTION public.update_chat_status(
    p_chat_id UUID,
    p_new_status VARCHAR
) RETURNS VOID AS $$
DECLARE
    v_current_manager_id UUID;
    v_manager_role VARCHAR;
    v_old_status VARCHAR;
BEGIN
    -- 1. Получаем текущего менеджера и его роль
    SELECT id, role INTO v_current_manager_id, v_manager_role
    FROM public.managers
    WHERE auth_user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Профиль менеджера не найден';
    END IF;

    -- 2. Получаем текущий статус чата
    SELECT status INTO v_old_status
    FROM public.chats
    WHERE id = p_chat_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Чат не найден';
    END IF;

    -- 3. Запрет на изменение эскалированных чатов обычным саппортом
    IF v_old_status = 'escalated' AND v_manager_role = 'support' THEN
        RAISE EXCEPTION 'Обычный саппорт не может изменить статус эскалированного чата';
    END IF;

    -- 4. Если статус не меняется, выходим
    IF v_old_status = p_new_status THEN
        RETURN;
    END IF;

    -- 5. Валидация прав для сброса в 'open'
    IF p_new_status = 'open' AND v_manager_role NOT IN ('admin', 'supervisor') THEN
        RAISE EXCEPTION 'Только администраторы могут переоткрывать чаты';
    END IF;

    -- 5. Логика для 'open' (сброс назначения)
    IF p_new_status = 'open' THEN
        DELETE FROM public.chat_assignments WHERE chat_id = p_chat_id;
    END IF;

    -- 6. Обновляем статус в таблице чатов
    UPDATE public.chats
    SET status = p_new_status,
        updated_at = NOW()
    WHERE id = p_chat_id;

    -- 7. Фиксируем изменение в истории
    INSERT INTO public.chat_status_history (
        chat_id,
        from_status,
        to_status,
        changed_by_manager_id
    ) VALUES (
        p_chat_id,
        v_old_status,
        p_new_status,
        v_current_manager_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
