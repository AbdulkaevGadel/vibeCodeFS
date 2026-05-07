-- Verification for retrieval JSON save RPC.
-- Read-only script. Run in Supabase SQL Editor after applying:
-- supabase/migrations/20260507000600_add_retrieval_json_save_rpc.sql
--
-- Rules:
-- - Do not add schema mutations here.
-- - Do not call save_chat_ai_retrieval_from_json_v1 directly from SQL Editor:
--   it persists chat_ai_runs retrieval fields.
-- - Do not select raw user text, prompt/context/config snapshots, provider payloads, or secrets.

-- 1. New combined retrieval+save RPC metadata.
select
    'json_save_rpc_metadata' as check_group,
    p.oid::regprocedure::text as function_signature,
    pg_get_function_result(p.oid) as result_type,
    pg_get_userbyid(p.proowner) as owner,
    p.prosecdef as security_definer,
    p.proconfig as function_config,
    case
        when p.prosecdef
             and pg_get_userbyid(p.proowner) = 'postgres'
             and p.proconfig @> array['search_path=public', 'statement_timeout=12000ms']
             and pg_get_function_result(p.oid) = 'jsonb'
            then 'ok'
        else 'blocker: json save rpc must be postgres-owned SECURITY DEFINER returning jsonb with safe function config'
    end as expected_result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid = 'public.save_chat_ai_retrieval_from_json_v1(uuid, text, jsonb, text, double precision, integer, integer)'::regprocedure;

-- 2. New combined retrieval+save RPC privileges are backend-only.
select
    'json_save_rpc_privileges' as check_group,
    role_name,
    has_function_privilege(
        role_name,
        'public.save_chat_ai_retrieval_from_json_v1(uuid, text, jsonb, text, double precision, integer, integer)'::regprocedure,
        'EXECUTE'
    ) as has_execute,
    case
        when role_name = 'service_role'
             and has_function_privilege(role_name, 'public.save_chat_ai_retrieval_from_json_v1(uuid, text, jsonb, text, double precision, integer, integer)'::regprocedure, 'EXECUTE')
            then 'ok'
        when role_name = 'service_role'
            then 'blocker: service_role cannot execute json save rpc'
        when has_function_privilege(role_name, 'public.save_chat_ai_retrieval_from_json_v1(uuid, text, jsonb, text, double precision, integer, integer)'::regprocedure, 'EXECUTE')
            then 'blocker: browser-facing role can execute json save rpc'
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

-- 3. Required dependency RPCs remain present and backend-only.
select
    'json_save_rpc_dependencies' as check_group,
    p.oid::regprocedure::text as function_signature,
    pg_get_userbyid(p.proowner) as owner,
    p.prosecdef as security_definer,
    has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute,
    has_function_privilege('public', p.oid, 'execute') as public_can_execute,
    has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
    has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
    case
        when pg_get_userbyid(p.proowner) = 'postgres'
             and p.prosecdef
             and has_function_privilege('service_role', p.oid, 'execute')
             and not has_function_privilege('public', p.oid, 'execute')
             and not has_function_privilege('anon', p.oid, 'execute')
             and not has_function_privilege('authenticated', p.oid, 'execute')
            then 'ok'
        else 'blocker: dependency rpc security boundary changed'
    end as expected_result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid in (
      'public.match_knowledge_chunks_from_json_v1(jsonb, text, double precision, integer, integer)'::regprocedure,
      'public.save_chat_ai_retrieval_result(uuid, text, text, double precision, integer, jsonb, text, text)'::regprocedure
  )
order by function_signature;

-- 4. Runtime follow-up: latest runs after deploy should get past retrieval_rpc_started/not_started.
select
    'latest_retrieval_runs' as check_group,
    id as run_id,
    chat_id,
    status,
    retrieval_status,
    response_kind,
    current_stage,
    stage_error,
    error_type,
    error_message,
    matched_chunks_count,
    top_similarity_score,
    jsonb_array_length(coalesce(retrieval_chunks, '[]'::jsonb)) as retrieval_chunks_length,
    created_at,
    started_at,
    updated_at,
    completed_at
from public.chat_ai_runs
where created_at >= now() - interval '48 hours'
order by created_at desc
limit 30;
