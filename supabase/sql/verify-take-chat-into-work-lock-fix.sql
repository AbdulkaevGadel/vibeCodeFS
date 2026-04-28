-- Verify Phase 4 fix: take_chat_into_work must not use LEFT JOIN ... FOR UPDATE.
-- Run after applying 20260428000500_fix_take_chat_into_work_assignment_lock.sql.

-- 1. Function definition should contain:
-- - select current_manager_id ... from public.chat_assignments ... for update
-- - no "left join public.managers" in the locked assignment query
select
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as identity_arguments,
    pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'take_chat_into_work'
order by identity_arguments;

-- 2. Legacy overload count should be 0 after cleanup migration,
-- or 1 if 20260428000400 has not been applied yet.
-- The active UI function is the one with identity_arguments = p_chat_id uuid.
select
    count(*) filter (
        where pg_get_function_identity_arguments(p.oid) = 'p_chat_id uuid'
    ) as active_take_chat_into_work_count,
    count(*) filter (
        where pg_get_function_identity_arguments(p.oid) = 'p_chat_id uuid, p_manager_id uuid'
    ) as legacy_take_chat_into_work_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'take_chat_into_work';
