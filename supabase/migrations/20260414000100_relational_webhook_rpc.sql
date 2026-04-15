-- Wave 8: Relational Webhook RPC
-- Миграция для перевода вебхука на реляционную модель

-- 1. DEFAULT статус для новых чатов
alter table public.chats
    alter column status set default 'open';

-- 2. Уникальный индекс для идемпотентности
create unique index if not exists chat_messages_telegram_message_id_idx
    on public.chat_messages (chat_id, telegram_message_id)
    where telegram_message_id is not null;

-- 3. RPC: обработка входящего Telegram сообщения
create or replace function public.process_incoming_telegram_message(
    p_telegram_user_id bigint,
    p_username varchar,
    p_first_name varchar,
    p_last_name varchar,
    p_telegram_chat_id bigint,
    p_bot_username varchar,
    p_telegram_message_id bigint,
    p_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
v_client_id uuid;
    v_chat_id uuid;
begin
    -- ⚠️ ВАЖНО:
    -- Эта функция вызывается из Edge Function через service_role
    -- поэтому auth.uid() здесь НЕ используется

    -- 1. Апсерт клиента (с защитой от NULL через COALESCE)
insert into public.clients (
    telegram_user_id,
    username,
    first_name,
    last_name,
    updated_at
) values (
             p_telegram_user_id,
             p_username,
             p_first_name,
             p_last_name,
             now()
         )
    on conflict (telegram_user_id) do update
                                          set
                                              username = coalesce(excluded.username, clients.username),
                                          first_name = coalesce(excluded.first_name, clients.first_name),
                                          last_name = coalesce(excluded.last_name, clients.last_name),
                                          updated_at = now()
                                          returning id into v_client_id;

-- 2. Апсерт чата (ВАЖНО: обновляем client_id)
insert into public.chats (
    telegram_chat_id,
    client_id,
    bot_username,
    updated_at
) values (
             p_telegram_chat_id,
             v_client_id,
             p_bot_username,
             now()
         )
    on conflict (telegram_chat_id, bot_username) do update
                                                        set
                                                            client_id = excluded.client_id,
                                                        updated_at = now()
                                                        returning id into v_chat_id;

-- 3. Идемпотентная вставка сообщения
insert into public.chat_messages (
    chat_id,
    sender_type,
    text,
    telegram_message_id,
    created_at
) values (
             v_chat_id,
             'client',
             p_text,
             p_telegram_message_id,
             now()
         )
    on conflict (chat_id, telegram_message_id) do nothing;

end;
$$;