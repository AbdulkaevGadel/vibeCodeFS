-- Verification for retrieval RPC DB-side timeout guard.
-- Read-only script. Run in Supabase SQL Editor after applying:
-- supabase/migrations/20260507000400_add_retrieval_rpc_db_timeout_guard.sql
--
-- Rules:
-- - Do not add schema mutations here.
-- - Do not select raw user text, prompt/context/config snapshots, provider payloads, or secrets.

-- 1. Function metadata and DB-side statement_timeout guard.
select
    'match_rpc_timeout_guard' as check_group,
    p.oid::regprocedure::text as function_signature,
    pg_get_userbyid(p.proowner) as owner,
    p.prosecdef as security_definer,
    p.proconfig as function_config,
    case
        when p.prosecdef
             and pg_get_userbyid(p.proowner) = 'postgres'
             and p.proconfig @> array['search_path=public', 'statement_timeout=12000ms']
            then 'ok'
        else 'blocker: match rpc must be postgres-owned SECURITY DEFINER with statement_timeout=12000ms'
    end as expected_result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid = 'public.match_knowledge_chunks_v1(vector, text, double precision, integer, integer)'::regprocedure;

-- 2. Function privileges remain backend-only.
select
    'match_rpc_privileges' as check_group,
    role_name,
    has_function_privilege(
        role_name,
        'public.match_knowledge_chunks_v1(vector, text, double precision, integer, integer)'::regprocedure,
        'EXECUTE'
    ) as has_execute,
    case
        when role_name = 'service_role'
             and has_function_privilege(role_name, 'public.match_knowledge_chunks_v1(vector, text, double precision, integer, integer)'::regprocedure, 'EXECUTE')
            then 'ok'
        when role_name = 'service_role'
            then 'blocker: service_role cannot execute match rpc'
        when has_function_privilege(role_name, 'public.match_knowledge_chunks_v1(vector, text, double precision, integer, integer)'::regprocedure, 'EXECUTE')
            then 'blocker: browser-facing role can execute match rpc'
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

-- 3. Direct DB call still returns the existing retrieval contract.
with sample_embedding as (
    select kc.embedding
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
    select public.match_knowledge_chunks_v1(
        embedding,
        'код подтверждения',
        0.60,
        5,
        50
    ) as result
    from sample_embedding
)
select
    'direct_match_rpc_contract' as check_group,
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
        else 'blocker: match rpc returned invalid contract'
    end as expected_result
from rpc_result;

-- 4. Current stuck retrieval RPC runs for runtime follow-up.
select
    'stuck_retrieval_rpc_runs' as check_group,
    id as run_id,
    chat_id,
    status,
    retrieval_status,
    response_kind,
    current_stage,
    stage_started_at,
    stage_error,
    error_type,
    error_message,
    now() - coalesce(started_at, created_at) as active_age,
    created_at,
    started_at,
    updated_at,
    completed_at
from public.chat_ai_runs
where status in ('pending', 'processing')
  and current_stage = 'retrieval_rpc_started'
order by stage_started_at desc;
