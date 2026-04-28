-- Verify rollback of AI orchestration foundation.
-- Manual Step:
-- Run this file in Supabase SQL Editor.
-- Read-only only: this file must not change schema or data.

-- 1. chat_ai_runs must not exist after rollback.
-- Expected:
-- table_exists = false
select
  to_regclass('public.chat_ai_runs') is not null as table_exists;

-- 2. No chat may remain in waiting_operator.
-- Expected:
-- waiting_operator_chats_count = 0
select
  count(*) as waiting_operator_chats_count
from public.chats
where status = 'waiting_operator';

-- 3. Status history must not contain waiting_operator.
-- Expected:
-- waiting_operator_history_count = 0
select
  count(*) as waiting_operator_history_count
from public.chat_status_history
where from_status = 'waiting_operator'
   or to_status = 'waiting_operator';

-- 4. chat_messages.sender_type must contain only client and manager.
-- Expected:
-- only rows with sender_type = client and/or manager
-- no ai
-- no system
select
  sender_type,
  count(*) as messages_count
from public.chat_messages
group by sender_type
order by sender_type;

-- 5. chats.status constraint must not allow waiting_operator.
-- Expected:
-- chats_status_check contains:
-- open, in_progress, escalated, resolved, closed
-- and does not contain waiting_operator
select
  conname,
  pg_get_constraintdef(oid) as constraint_definition
from pg_constraint
where conrelid = 'public.chats'::regclass
  and conname = 'chats_status_check';

-- 6. chat_status_history status constraints must not allow waiting_operator.
-- Expected:
-- both constraints contain:
-- open, in_progress, escalated, resolved, closed
-- and do not contain waiting_operator
select
  conname,
  pg_get_constraintdef(oid) as constraint_definition
from pg_constraint
where conrelid = 'public.chat_status_history'::regclass
  and conname in (
    'chat_status_history_from_status_check',
    'chat_status_history_to_status_check'
  )
order by conname;

-- 7. chat_messages.sender_type constraint must not allow ai/system.
-- Expected:
-- chat_messages_sender_type_check contains only client and manager
select
  conname,
  pg_get_constraintdef(oid) as constraint_definition
from pg_constraint
where conrelid = 'public.chat_messages'::regclass
  and conname = 'chat_messages_sender_type_check';

-- 8. chat_messages manager consistency must match the pre-AI model.
-- Expected:
-- manager messages require manager_id is not null
-- client messages require manager_id is null
-- no ai/system branches
select
  conname,
  pg_get_constraintdef(oid) as constraint_definition
from pg_constraint
where conrelid = 'public.chat_messages'::regclass
  and conname = 'chat_messages_sender_manager_consistency_check';
