-- Wave 5 backfill: chat_messages
-- Purpose:
-- populate public.chat_messages from legacy public.messages
-- using the already backfilled public.chats and public.clients.
--
-- This is a manual data step, not a migration.
-- Run after Migration #2 is applied and verified.

with resolved_legacy_messages as (
  select
    m.id as legacy_message_id,
    ch.id as chat_id,
    m.text,
    m.created_at
  from public.messages m
  inner join public.chats ch
    on ch.telegram_chat_id = m.chat_id
   and ch.bot_username = m.bot_username
)
insert into public.chat_messages (
  chat_id,
  sender_type,
  manager_id,
  text,
  telegram_message_id,
  legacy_message_id,
  created_at
)
select
  rlm.chat_id,
  'client'::text as sender_type,
  null::uuid as manager_id,
  rlm.text,
  null::bigint as telegram_message_id,
  rlm.legacy_message_id,
  rlm.created_at
from resolved_legacy_messages rlm
on conflict (legacy_message_id) where legacy_message_id is not null do nothing;
