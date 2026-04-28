-- Verify Phase 4 cleanup: legacy overloaded RPC signatures are removed.
-- Run after applying 20260428000400_drop_legacy_chat_workflow_rpc_overloads.sql.

-- 1. take_chat_into_work should have exactly one active signature:
-- Expected:
-- identity_arguments = p_chat_id uuid
select
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as identity_arguments,
    pg_get_function_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'take_chat_into_work'
order by identity_arguments;

-- 2. update_chat_status should have exactly one active signature:
-- Expected:
-- identity_arguments = p_chat_id uuid, p_new_status character varying, p_expected_status character varying
select
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as identity_arguments,
    pg_get_function_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'update_chat_status'
order by identity_arguments;

-- 3. Legacy overload count should be 0.
select count(*) as legacy_overloads_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    (
      p.proname = 'take_chat_into_work'
      and pg_get_function_identity_arguments(p.oid) = 'p_chat_id uuid, p_manager_id uuid'
    )
    or
    (
      p.proname = 'update_chat_status'
      and pg_get_function_identity_arguments(p.oid) = 'p_chat_id uuid, p_new_status character varying'
    )
  );
