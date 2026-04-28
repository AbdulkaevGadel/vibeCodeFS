-- Phase 4 verification: waiting_operator workflow.
-- Run each SELECT in Supabase SQL Editor after applying the migration.
-- Expected: constraints include waiting_operator, functions are updated,
-- no existing waiting_operator rows unless you manually created them after apply.

-- 1. chats.status constraint must allow waiting_operator.
select
    conname,
    pg_get_constraintdef(oid) as constraint_definition
from pg_constraint
where conrelid = 'public.chats'::regclass
  and conname = 'chats_status_check';

-- 2. chat_status_history constraints must allow waiting_operator.
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

-- 3. Current data audit: waiting_operator rows.
-- Expected immediately after migration: 0, unless test/manual rows were created.
select count(*) as waiting_operator_chats_count
from public.chats
where status = 'waiting_operator';

-- 4. Current history audit: waiting_operator transitions.
-- Expected immediately after migration: 0, unless test/manual transitions were created.
select count(*) as waiting_operator_history_count
from public.chat_status_history
where from_status = 'waiting_operator'
   or to_status = 'waiting_operator';

-- 5. take_chat_into_work must know waiting_operator and use row locking.
-- Expected definition contains:
-- v_current_status not in ('open', 'waiting_operator')
-- for update
-- status = 'in_progress'
select
    p.proname as function_name,
    pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'take_chat_into_work';

-- 6. update_chat_status must enforce role/status rules.
-- Expected definition contains:
-- p_new_status not in (... 'waiting_operator' ...)
-- resolved/closed -> waiting_operator guard
-- support cannot set waiting_operator
-- delete from public.chat_assignments for open/waiting_operator
select
    p.proname as function_name,
    pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'update_chat_status';

-- 7. Detect invalid active queue state.
-- Expected: 0 rows. waiting_operator should not have an assignment.
select count(*) as waiting_operator_assigned_count
from public.chats c
join public.chat_assignments ca on ca.chat_id = c.id
where c.status = 'waiting_operator';
