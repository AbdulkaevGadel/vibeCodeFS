-- Verification for retrieval JSON embedding RPC.
-- Read-only script. Run in Supabase SQL Editor after applying:
-- supabase/migrations/20260507000500_add_retrieval_json_embedding_rpc.sql
--
-- Rules:
-- - Do not add schema mutations here.
-- - Do not select raw user text, prompt/context/config snapshots, provider payloads, or secrets.

-- 1. New JSON RPC metadata.
select
    'json_embedding_rpc_metadata' as check_group,
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
        else 'blocker: json embedding rpc must be postgres-owned SECURITY DEFINER returning jsonb with safe function config'
    end as expected_result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid = 'public.match_knowledge_chunks_from_json_v1(jsonb, text, double precision, integer, integer)'::regprocedure;

-- 2. New JSON RPC privileges are backend-only.
select
    'json_embedding_rpc_privileges' as check_group,
    role_name,
    has_function_privilege(
        role_name,
        'public.match_knowledge_chunks_from_json_v1(jsonb, text, double precision, integer, integer)'::regprocedure,
        'EXECUTE'
    ) as has_execute,
    case
        when role_name = 'service_role'
             and has_function_privilege(role_name, 'public.match_knowledge_chunks_from_json_v1(jsonb, text, double precision, integer, integer)'::regprocedure, 'EXECUTE')
            then 'ok'
        when role_name = 'service_role'
            then 'blocker: service_role cannot execute json embedding rpc'
        when has_function_privilege(role_name, 'public.match_knowledge_chunks_from_json_v1(jsonb, text, double precision, integer, integer)'::regprocedure, 'EXECUTE')
            then 'blocker: browser-facing role can execute json embedding rpc'
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

-- 3. Direct DB call with a sample JSON embedding returns the retrieval contract.
with sample_embedding as (
    select kc.embedding::text::jsonb as embedding_json
    from public.knowledge_chunks kc
    join public.knowledge_chunk_sets kcs on kcs.id = kc.chunk_set_id
    join public.knowledge_base_articles a on a.id = kc.article_id
    where kcs.is_active = true
      and kcs.status = 'completed'
      and kc.embedding_status = 'completed'
      and kc.embedding is not null
      and a.status = 'published'::public.article_status
    order by kc.id
    limit 1
),
rpc_result as (
    select public.match_knowledge_chunks_from_json_v1(
        embedding_json,
        'код подтверждения',
        0.60,
        5,
        50
    ) as result
    from sample_embedding
)
select
    'json_embedding_rpc_contract' as check_group,
    result ->> 'retrieval_status' as retrieval_status,
    result ->> 'error_type' as error_type,
    result ->> 'error_message' as error_message,
    jsonb_array_length(coalesce(result -> 'chunks', '[]'::jsonb)) as chunks_length,
    case
        when result ? 'retrieval_status'
             and result ? 'top_similarity_score'
             and result ? 'matched_chunks_count'
             and result ? 'chunks'
             and result ->> 'retrieval_status' in ('hit', 'miss', 'empty', 'failed')
            then 'ok'
        else 'blocker: json embedding rpc returned invalid retrieval contract'
    end as expected_result
from rpc_result;

-- 4. Invalid JSON embedding shape returns controlled validation failure.
with rpc_result as (
    select public.match_knowledge_chunks_from_json_v1(
        '[1, 2, 3]'::jsonb,
        'код подтверждения',
        0.60,
        5,
        50
    ) as result
)
select
    'json_embedding_rpc_invalid_shape' as check_group,
    result ->> 'retrieval_status' as retrieval_status,
    result ->> 'error_type' as error_type,
    result ->> 'error_message' as error_message,
    result ->> 'matched_chunks_count' as matched_chunks_count,
    jsonb_array_length(coalesce(result -> 'chunks', '[]'::jsonb)) as chunks_length,
    case
        when result ->> 'retrieval_status' = 'failed'
             and result ->> 'error_type' = 'validation'
             and result ->> 'error_message' = 'INVALID_RETRIEVAL_REQUEST'
             and (result ->> 'matched_chunks_count')::integer = 0
             and jsonb_array_length(coalesce(result -> 'chunks', '[]'::jsonb)) = 0
            then 'ok'
        else 'blocker: invalid json embedding shape must return controlled validation failure'
    end as expected_result
from rpc_result;

-- 5. Old vector RPC remains available for backend/direct compatibility.
select
    'old_vector_rpc_compatibility' as check_group,
    p.oid::regprocedure::text as function_signature,
    pg_get_function_result(p.oid) as result_type,
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
        else 'blocker: old vector rpc compatibility/security boundary changed'
    end as expected_result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid = 'public.match_knowledge_chunks_v1(vector, text, double precision, integer, integer)'::regprocedure;

-- 6. Runtime follow-up: latest RAG/retrieval runs should not stay stuck at retrieval_rpc_started after deploy.
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
