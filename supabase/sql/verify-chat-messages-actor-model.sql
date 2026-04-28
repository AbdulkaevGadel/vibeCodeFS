-- Verification for Phase 2: chat_messages actor model.
-- Run in Supabase SQL Editor after applying:
-- supabase/migrations/20260428000100_extend_chat_messages_actor_model.sql

-- 1. Expected:
-- chat_messages_sender_type_check allows client, manager, ai, system.
select
    conname,
    pg_get_constraintdef(oid) as constraint_definition
from pg_constraint
where conrelid = 'public.chat_messages'::regclass
  and conname = 'chat_messages_sender_type_check';

-- 2. Expected:
-- manager requires manager_id; client/ai/system require manager_id is null.
select
    conname,
    pg_get_constraintdef(oid) as constraint_definition
from pg_constraint
where conrelid = 'public.chat_messages'::regclass
  and conname = 'chat_messages_sender_manager_consistency_check';

-- 3. Expected:
-- only known sender types are present.
select
    sender_type,
    count(*) as messages_count
from public.chat_messages
group by sender_type
order by sender_type;

-- 4. Expected:
-- invalid_rows_count = 0.
select
    count(*) as invalid_rows_count
from public.chat_messages
where sender_type not in ('client', 'manager', 'ai', 'system')
   or (sender_type = 'manager' and manager_id is null)
   or (sender_type in ('client', 'ai', 'system') and manager_id is not null);

-- 5. Expected:
-- delivery trigger still targets manager messages only.
select
    tgname as trigger_name,
    pg_get_triggerdef(oid) as trigger_definition
from pg_trigger
where tgrelid = 'public.chat_messages'::regclass
  and tgname = 'tr_message_deliver';
