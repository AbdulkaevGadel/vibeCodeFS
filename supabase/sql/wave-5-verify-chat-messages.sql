-- Wave 5 verification: chat_messages
-- Run manually after wave-5-backfill-chat-messages.sql

-- =========================================================
-- 1. Expected imported message count vs actual imported count
-- =========================================================

with expected_legacy_messages as (
  select
    m.id as legacy_message_id
  from public.messages m
  inner join public.chats ch
    on ch.telegram_chat_id = m.chat_id
   and ch.bot_username = m.bot_username
)
select
  (
    select count(*)
    from expected_legacy_messages
  ) as expected_imported_message_count,
  (
    select count(*)
    from public.chat_messages cm
    where cm.legacy_message_id is not null
  ) as actual_imported_message_count;

-- =========================================================
-- 2. Exact imported message mapping verification
-- =========================================================

with expected_messages as (
  select
    m.id as legacy_message_id,
    ch.id as expected_chat_id,
    'client'::text as expected_sender_type,
    null::uuid as expected_manager_id,
    m.text as expected_text,
    m.created_at as expected_created_at
  from public.messages m
  inner join public.chats ch
    on ch.telegram_chat_id = m.chat_id
   and ch.bot_username = m.bot_username
)
select
  em.legacy_message_id,
  em.expected_chat_id,
  cm.chat_id as actual_chat_id,
  em.expected_sender_type,
  cm.sender_type as actual_sender_type,
  em.expected_manager_id,
  cm.manager_id as actual_manager_id,
  em.expected_text,
  cm.text as actual_text,
  em.expected_created_at,
  cm.created_at as actual_created_at
from expected_messages em
left join public.chat_messages cm
  on cm.legacy_message_id = em.legacy_message_id
where cm.id is null
   or cm.chat_id is distinct from em.expected_chat_id
   or cm.sender_type is distinct from em.expected_sender_type
   or cm.manager_id is not null
   or cm.text is distinct from em.expected_text
   or cm.created_at is distinct from em.expected_created_at
order by em.legacy_message_id;

-- =========================================================
-- 3. Imported legacy rows without traceability key
-- =========================================================

select
  cm.id,
  cm.chat_id,
  cm.sender_type,
  cm.manager_id,
  cm.text,
  cm.created_at
from public.chat_messages cm
where cm.legacy_message_id is null
  and cm.sender_type = 'client'
order by cm.created_at, cm.id;

-- =========================================================
-- 4. Duplicate legacy import verification
-- Should return no rows.
-- =========================================================

select
  cm.legacy_message_id,
  count(*) as duplicate_count
from public.chat_messages cm
where cm.legacy_message_id is not null
group by cm.legacy_message_id
having count(*) > 1
order by cm.legacy_message_id;
