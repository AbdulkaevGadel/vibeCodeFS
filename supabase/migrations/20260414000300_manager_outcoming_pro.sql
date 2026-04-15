-- Wave 9 Pro: Outcoming Messages Flow (BULLETPROOF)
-- Миграция с поддержкой Idempotency Key (client_message_id)

-- 1. Добавление полей в chat_messages
alter table public.chat_messages 
    add column delivery_status text not null default 'pending',
    add column delivery_error text,
    add column client_message_id uuid unique; -- Ключ идемпотентности для исходящих

-- Обновляем статус для истории
update public.chat_messages set delivery_status = 'sent' where delivery_status is null;

-- Ограничение статусов
alter table public.chat_messages 
    add constraint chat_messages_delivery_status_check 
    check (delivery_status in ('pending', 'sent', 'failed'));

-- 2. Композитный индекс для Realtime и фильтрации
create index if not exists idx_chat_messages_chat_delivery 
    on public.chat_messages (chat_id, delivery_status);

-- 3. Включение Realtime (idempotent setup)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'chat_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
    END IF;
END $$;

-- 4. RPC: Обработка исходящего сообщения (Bulletproof)
create or replace function public.process_manager_outcoming_message(
    p_chat_id uuid,
    p_text text,
    p_client_message_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_manager_id uuid;
    v_manager_role text;
    v_current_status text;
    v_tg_chat_id bigint;
    v_bot_username varchar;
    v_message_id uuid;
    v_auth_id uuid;
begin
    -- 1. Валидация входа
    if p_text is null or trim(p_text) = '' then
        raise exception 'Сообщение не может быть пустым';
    end if;

    if length(p_text) > 4000 then
        raise exception 'Сообщение слишком длинное';
    end if;

    if p_client_message_id is null then
        raise exception 'client_message_id обязателен для идемпотентности';
    end if;

    -- 2. Идентификация менеджера
    v_auth_id := auth.uid();
    select id, role into v_manager_id, v_manager_role from public.managers where auth_user_id = v_auth_id;
    if v_manager_id is null then raise exception 'Менеджер не найден'; end if;

    -- 3. Блокировка чата и получение данных (Source of Truth)
    select c.status, c.telegram_chat_id, c.bot_username 
    into v_current_status, v_tg_chat_id, v_bot_username
    from public.chats c where c.id = p_chat_id for update;

    if v_tg_chat_id is null then raise exception 'Чат не найден'; end if;

    -- 4. Бизнес-проверки статуса
    if v_current_status in ('closed', 'resolved') then
        raise exception 'Чат закрыт или решен';
    end if;

    if v_manager_role = 'support' then
        if not exists (select 1 from public.chat_assignments where chat_id = p_chat_id and current_manager_id = v_manager_id) then
            raise exception 'Вы не назначены на этот чат';
        end if;
        if v_current_status = 'escalated' then
            raise exception 'Чат эскалирован';
        end if;
    end if;

    -- 5. Идемпотентная вставка
    insert into public.chat_messages (
        chat_id, sender_type, manager_id, text, delivery_status, client_message_id, created_at
    ) values (
        p_chat_id, 'manager', v_manager_id, p_text, 'pending', p_client_message_id, now()
    )
    on conflict (client_message_id) do nothing
    returning id into v_message_id;

    -- 6. Если v_message_id is null, значит сработал on conflict (дубликат)
    if v_message_id is null then
        -- Мы могли бы вернуть существующий message_id, но для Edge Function 
        -- проще просто вернуть пустой результат или ошибку "уже обрабатывается"
        -- Здесь вернем существующий ID для консистентности
        select id into v_message_id from public.chat_messages where client_message_id = p_client_message_id;
        
        -- Если мы нашли существующее сообщение, возвращаем его данные
        -- Но Edge Function должна понимать, что это дубль и, возможно, не отправлять в ТГ повторно.
        -- Для простоты: если это дубль, RPC вернет 'is_duplicate': true
        return json_build_object(
            'message_id', v_message_id,
            'is_duplicate', true
        );
    end if;

    -- 7. Возврат данных для Edge Function
    return json_build_object(
        'message_id', v_message_id,
        'telegram_chat_id', v_tg_chat_id,
        'bot_username', v_bot_username,
        'text', p_text,
        'is_duplicate', false
    );
end;
$$;
