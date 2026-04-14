-- Wave 8 Fix: Idempotency Synchronization
-- Приводим ручные правки в БД к коду миграций.
-- Делаем миграцию идемпотентной: ее можно запускать многократно без ошибок.

-- 1. Удаляем старый частичный индекс (если он остался от предыдущих попыток)
drop index if exists public.chat_messages_telegram_message_id_idx;

-- 2. Удаляем возможные старые версии констрейтов (для чистоты)
alter table public.chat_messages 
    drop constraint if exists chat_messages_chat_id_telegram_message_id_unique;

alter table public.chat_messages 
    drop constraint if exists chat_messages_idempotency_key;

-- 3. Создаем финальный UNIQUE CONSTRAINT с понятным бизнес-именем
alter table public.chat_messages 
    add constraint chat_messages_idempotency_key 
    unique (chat_id, telegram_message_id);

-- Комментарий для будущих поколений:
comment on constraint chat_messages_idempotency_key on public.chat_messages 
    is 'Enforces idempotency for incoming Telegram messages by chat and message ID';
