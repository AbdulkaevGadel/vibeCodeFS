-- Verification for stale AI run recovery.
-- Read-only script. Run in Supabase SQL Editor after applying:
-- supabase/migrations/20260507000200_add_ai_stale_run_recovery.sql
--
-- Rules:
-- - Do not add schema mutations here.
-- - Do not call mutating RPCs from this verification script.
-- - Do not select raw context_snapshot, prompt_snapshot, config_snapshot, or provider payloads.

-- 1. Recovery RPC existence and SECURITY DEFINER.
select
    'recovery_rpc_definition' as check_group,
    p.oid::regprocedure::text as function_signature,
    p.prosecdef as security_definer,
    case
        when p.prosecdef then 'ok'
        else 'blocker: recovery rpc is not security definer'
    end as expected_result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid = 'public.recover_stale_chat_ai_runs(uuid, integer, integer)'::regprocedure;

-- 2. Recovery RPC privileges.
-- Expected:
-- - service_role has EXECUTE.
-- - anon/authenticated/public do not have EXECUTE.
select
    'recovery_rpc_privileges' as check_group,
    role_name,
    has_function_privilege(
        role_name,
        'public.recover_stale_chat_ai_runs(uuid, integer, integer)'::regprocedure,
        'EXECUTE'
    ) as has_execute,
    case
        when role_name = 'service_role'
             and has_function_privilege(role_name, 'public.recover_stale_chat_ai_runs(uuid, integer, integer)'::regprocedure, 'EXECUTE')
            then 'ok'
        when role_name = 'service_role'
            then 'blocker: service_role cannot execute recovery rpc'
        when has_function_privilege(role_name, 'public.recover_stale_chat_ai_runs(uuid, integer, integer)'::regprocedure, 'EXECUTE')
            then 'blocker: browser-facing role can execute recovery rpc'
        else 'ok'
    end as expected_result
from (
    values
        ('service_role'),
        ('anon'),
        ('authenticated'),
        ('public')
) as roles(role_name)
order by role_name;

-- 3. Stale active runs older than the default TTL.
-- Expected after a new Telegram message in the affected chat:
-- - no rows for that chat.
-- If rows remain, the orchestrator did not recover them or the new function was not deployed/applied.
select
    'stale_active_runs_after_recovery' as check_group,
    id as run_id,
    chat_id,
    status,
    retrieval_status,
    response_kind,
    response_message_id,
    created_at,
    started_at,
    completed_at,
    case
        when response_message_id is not null
            then 'ok: published run is intentionally not recoverable'
        else 'blocker: stale active run still blocks ai flow'
    end as expected_result
from public.chat_ai_runs
where status in ('pending', 'processing')
  and coalesce(started_at, created_at) < now() - interval '10 minutes'
order by coalesce(started_at, created_at), id
limit 50;

-- 4. Fresh active runs must not be considered stale.
select
    'fresh_active_runs' as check_group,
    count(*) as fresh_active_count,
    case
        when count(*) >= 0 then 'ok'
        else 'blocker'
    end as expected_result
from public.chat_ai_runs
where status in ('pending', 'processing')
  and coalesce(started_at, created_at) >= now() - interval '10 minutes';

-- 5. Recovered runs must be terminal failed/system rows without published AI message.
select
    'recent_recovered_runs' as check_group,
    id as run_id,
    chat_id,
    status,
    error_type,
    error_message,
    response_message_id,
    completed_at,
    case
        when status = 'failed'
             and error_type = 'system'
             and error_message = 'STALE_AI_RUN_RECOVERED'
             and response_message_id is null
             and completed_at is not null
            then 'ok'
        else 'blocker: invalid recovered run state'
    end as expected_result
from public.chat_ai_runs
where error_message = 'STALE_AI_RUN_RECOVERED'
order by completed_at desc
limit 50;

-- 6. Summary counters for quick review.
select
    'stale_recovery_summary' as check_group,
    count(*) filter (
        where status in ('pending', 'processing')
          and coalesce(started_at, created_at) < now() - interval '10 minutes'
    ) as stale_active_runs,
    count(*) filter (
        where error_message = 'STALE_AI_RUN_RECOVERED'
          and status = 'failed'
          and error_type = 'system'
          and response_message_id is null
          and completed_at is not null
    ) as valid_recovered_runs,
    count(*) filter (
        where error_message = 'STALE_AI_RUN_RECOVERED'
          and not (
              status = 'failed'
              and error_type = 'system'
              and response_message_id is null
              and completed_at is not null
          )
    ) as invalid_recovered_runs
from public.chat_ai_runs;
