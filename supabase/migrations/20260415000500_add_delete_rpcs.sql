-- RPC для удаления одного сообщения (только admin)
CREATE OR REPLACE FUNCTION public.delete_message(
    p_message_id UUID
) RETURNS VOID AS $$
DECLARE
    v_manager_id UUID;
    v_manager_role VARCHAR;
BEGIN
    -- 1. Проверяем аутентификацию и роль
    SELECT id, role INTO v_manager_id, v_manager_role
    FROM public.managers
    WHERE auth_user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Менеджер не найден';
    END IF;

    IF v_manager_role <> 'admin' THEN
        RAISE EXCEPTION 'Только администратор может удалять сообщения';
    END IF;

    -- 2. Проверяем что сообщение существует
    IF NOT EXISTS (SELECT 1 FROM public.chat_messages WHERE id = p_message_id) THEN
        RAISE EXCEPTION 'Сообщение не найдено';
    END IF;

    -- 3. Удаляем сообщение
    DELETE FROM public.chat_messages WHERE id = p_message_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC для удаления чата целиком со всеми данными (только admin)
CREATE OR REPLACE FUNCTION public.delete_chat_admin(
    p_chat_id UUID
) RETURNS VOID AS $$
DECLARE
    v_manager_id UUID;
    v_manager_role VARCHAR;
BEGIN
    -- 1. Проверяем аутентификацию и роль
    SELECT id, role INTO v_manager_id, v_manager_role
    FROM public.managers
    WHERE auth_user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Менеджер не найден';
    END IF;

    IF v_manager_role <> 'admin' THEN
        RAISE EXCEPTION 'Только администратор может удалять чаты';
    END IF;

    -- 2. Проверяем что чат существует
    IF NOT EXISTS (SELECT 1 FROM public.chats WHERE id = p_chat_id) THEN
        RAISE EXCEPTION 'Чат не найден';
    END IF;

    -- 3. Удаляем в правильном порядке (дочерние таблицы сначала)
    DELETE FROM public.chat_messages WHERE chat_id = p_chat_id;
    DELETE FROM public.assignment_history WHERE chat_id = p_chat_id;
    DELETE FROM public.chat_status_history WHERE chat_id = p_chat_id;
    DELETE FROM public.chat_assignments WHERE chat_id = p_chat_id;

    -- 4. Удаляем сам чат
    DELETE FROM public.chats WHERE id = p_chat_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
