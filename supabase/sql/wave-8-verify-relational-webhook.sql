-- Wave 8 verification: Relational Webhook Live Flow
-- Run manually after applying 20260414000100_relational_webhook_rpc.sql 
-- and sending several test messages from Telegram.

-- =========================================================
-- 1. Idempotency Check (Deduplication)
-- Should return no rows.
-- =========================================================
select 
    chat_id, 
    telegram_message_id, 
    count(*) as duplicate_count
from public.chat_messages
where telegram_message_id is not null
group by chat_id, telegram_message_id
having count(*) > 1;

-- =========================================================
-- 2. Data Connectivity (Orphans)
-- Should return no rows.
-- =========================================================

-- Messages without a chat
select count(*) as orphaned_messages
from public.chat_messages cm
left join public.chats c on c.id = cm.chat_id
where c.id is null;

-- Chats without a client
select count(*) as orphaned_chats
from public.chats c
left join public.clients cl on cl.id = c.client_id
where cl.id is null;

-- =========================================================
-- 3. Clients Consistency
-- Should return no rows.
-- =========================================================
select id, telegram_user_id
from public.clients
where telegram_user_id is null;

-- =========================================================
-- 4. New Chat Status Default ('open')
-- Check chats created in the last 1 hour (or since migration).
-- =========================================================
select 
    id, 
    telegram_chat_id, 
    status, 
    created_at
from public.chats
where created_at > now() - interval '1 hour'
  and status != 'open';

-- =========================================================
-- 5. Cutover Verification (Live check)
-- Compares message flow between legacy and relational tables
-- in the last 15 minutes.
-- =========================================================
select
    (select count(*) from public.messages where created_at > now() - interval '15 minutes') as legacy_new_messages_count,
    (select count(*) from public.chat_messages where created_at > now() - interval '15 minutes' and legacy_message_id is null) as relational_new_messages_count;

-- =========================================================
-- 6. RPC process_incoming_telegram_message functional check
-- Verify that new client profile data exists and uses COALESCE logic
-- =========================================================
select 
    telegram_user_id, 
    username, 
    first_name, 
    last_name, 
    updated_at
from public.clients
where updated_at > now() - interval '1 hour'
order by updated_at desc;

-- =========================================================
-- 7. New messages sender_type check
-- All messages from webhook MUST have sender_type = 'client'
-- Should return no rows.
-- =========================================================
select count(*) as invalid_sender_type_count
from public.chat_messages
where created_at > now() - interval '1 hour'
  and legacy_message_id is null
  and sender_type != 'client';

-- =========================================================
-- 8. Chat Uniqueness Check
-- Should return no rows.
-- =========================================================
select 
    telegram_chat_id, 
    bot_username, 
    count(*) as duplicate_chat_count
from public.chats
group by telegram_chat_id, bot_username
having count(*) > 1;
