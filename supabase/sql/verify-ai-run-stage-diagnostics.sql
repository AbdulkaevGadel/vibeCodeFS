-- Verification for AI run stage diagnostics.
-- Read-only script. Run in Supabase SQL Editor after applying:
-- supabase/migrations/20260507000300_add_ai_run_stage_diagnostics.sql
--
-- Rules:
-- - Do not add schema mutations here.
-- - Do not call mutating RPCs from this verification script.
-- - Do not select raw user text, context_snapshot, prompt_snapshot, config_snapshot,
--   provider payloads, or secrets.

-- 1. Stage diagnostic columns exist and are nullable.
select
    'stage_columns' as check_group,
    c.column_name,
    c.data_type,
    c.is_nullable,
    case
        when c.column_name in ('current_stage', 'stage_error')
             and c.data_type = 'text'
             and c.is_nullable = 'YES'
            then 'ok'
        when c.column_name = 'stage_started_at'
             and c.data_type = 'timestamp with time zone'
             and c.is_nullable = 'YES'
            then 'ok'
        else 'blocker: unexpected stage column definition'
    end as expected_result
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'chat_ai_runs'
  and c.column_name in ('current_stage', 'stage_started_at', 'stage_error')
order by c.column_name;

-- 2. Stage RPC existence and SECURITY DEFINER.
select
    'stage_rpc_definition' as check_group,
    p.oid::regprocedure::text as function_signature,
    pg_get_userbyid(p.proowner) as owner,
    p.prosecdef as security_definer,
    case
        when p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres' then 'ok'
        else 'blocker: stage rpc must be postgres-owned SECURITY DEFINER'
    end as expected_result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid = 'public.update_chat_ai_run_stage(uuid, text, text)'::regprocedure;

-- 3. Stage RPC privileges.
-- Expected:
-- - service_role has EXECUTE.
-- - anon/authenticated/public do not have EXECUTE.
select
    'stage_rpc_privileges' as check_group,
    role_name,
    has_function_privilege(
        role_name,
        'public.update_chat_ai_run_stage(uuid, text, text)'::regprocedure,
        'EXECUTE'
    ) as has_execute,
    case
        when role_name = 'service_role'
             and has_function_privilege(role_name, 'public.update_chat_ai_run_stage(uuid, text, text)'::regprocedure, 'EXECUTE')
            then 'ok'
        when role_name = 'service_role'
            then 'blocker: service_role cannot execute stage rpc'
        when has_function_privilege(role_name, 'public.update_chat_ai_run_stage(uuid, text, text)'::regprocedure, 'EXECUTE')
            then 'blocker: browser-facing role can execute stage rpc'
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

-- 4. Recent AI run summary with safe stage diagnostics only.
select
    'recent_ai_runs_stage_summary' as check_group,
    id as run_id,
    chat_id,
    status,
    retrieval_status,
    response_kind,
    current_stage,
    stage_started_at,
    stage_error,
    matched_chunks_count,
    top_similarity_score,
    created_at,
    started_at,
    completed_at,
    case
        when current_stage is null
             or current_stage in (
                'processing_marked',
                'trigger_loaded',
                'retrieval_started',
                'embedding_started',
                'embedding_finished',
                'retrieval_rpc_started',
                'retrieval_saved',
                'failed'
             )
            then 'ok'
        else 'blocker: invalid current_stage'
    end as expected_result
from public.chat_ai_runs
where created_at >= now() - interval '48 hours'
order by created_at desc
limit 50;

-- 5. Controlled retrieval timeout contract.
-- Expected after a timeout-class runtime test:
-- - failed/external/RETRIEVAL_STAGE_TIMEOUT.
-- - current_stage remains the last reached stage, not a raw user/query/payload value.
select
    'recent_retrieval_timeouts' as check_group,
    id as run_id,
    chat_id,
    status,
    retrieval_status,
    error_type,
    error_message,
    current_stage,
    stage_started_at,
    stage_error,
    completed_at,
    case
        when status = 'failed'
             and retrieval_status = 'failed'
             and error_type = 'external'
             and error_message = 'RETRIEVAL_STAGE_TIMEOUT'
             and stage_error = 'RETRIEVAL_STAGE_TIMEOUT'
             and current_stage in (
                'processing_marked',
                'trigger_loaded',
                'retrieval_started',
                'embedding_started',
                'embedding_finished',
                'retrieval_rpc_started',
                'retrieval_saved'
             )
            then 'ok'
        else 'blocker: invalid retrieval timeout contract'
    end as expected_result
from public.chat_ai_runs
where created_at >= now() - interval '48 hours'
  and error_message = 'RETRIEVAL_STAGE_TIMEOUT'
order by created_at desc
limit 30;

-- 6. Violations summary.
with violations as (
    select
        id as run_id,
        'invalid_current_stage' as violation
    from public.chat_ai_runs
    where current_stage is not null
      and current_stage not in (
          'processing_marked',
          'trigger_loaded',
          'retrieval_started',
          'embedding_started',
          'embedding_finished',
          'retrieval_rpc_started',
          'retrieval_saved',
          'failed'
      )

    union all

    select
        id as run_id,
        'stage_error_too_long' as violation
    from public.chat_ai_runs
    where stage_error is not null
      and char_length(stage_error) > 500

    union all

    select
        id as run_id,
        'timeout_contract_invalid' as violation
    from public.chat_ai_runs
    where error_message = 'RETRIEVAL_STAGE_TIMEOUT'
      and not (
          status = 'failed'
          and retrieval_status = 'failed'
          and error_type = 'external'
          and stage_error = 'RETRIEVAL_STAGE_TIMEOUT'
          and current_stage in (
              'processing_marked',
              'trigger_loaded',
              'retrieval_started',
              'embedding_started',
              'embedding_finished',
              'retrieval_rpc_started',
              'retrieval_saved'
          )
      )
)
select
    'stage_diagnostics_violations' as check_group,
    run_id,
    violation
from violations
order by violation, run_id;
