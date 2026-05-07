-- Verification for retrieval similarity score contract.
-- Read-only script. Run in Supabase SQL Editor after applying:
-- supabase/migrations/20260507000700_clamp_retrieval_similarity_scores.sql
--
-- Rules:
-- - Do not add schema mutations here.
-- - Do not select raw user text, prompt/context/config snapshots, provider payloads, or secrets.

-- 1. Retrieval RPC metadata remains backend-only and guarded.
select
    'match_rpc_metadata' as check_group,
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
        else 'blocker: match rpc metadata/security changed unexpectedly'
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

-- 3. Direct retrieval call returns chunk score fields within persistence contract.
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
),
chunk_rows as (
    select
        result,
        chunk_item.value as chunk_item
    from rpc_result
    left join lateral jsonb_array_elements(coalesce(result -> 'chunks', '[]'::jsonb)) as chunk_item(value)
        on true
),
violations as (
    select
        'top_similarity_score' as field_name,
        result ->> 'top_similarity_score' as field_value
    from rpc_result
    where jsonb_typeof(result -> 'top_similarity_score') = 'number'
      and (
          (result ->> 'top_similarity_score')::double precision < 0
          or (result ->> 'top_similarity_score')::double precision > 1
          or (result ->> 'top_similarity_score')::double precision = 'NaN'::double precision
      )

    union all

    select
        'similarity_score' as field_name,
        chunk_item ->> 'similarity_score' as field_value
    from chunk_rows
    where chunk_item is not null
      and (
          jsonb_typeof(chunk_item -> 'similarity_score') <> 'number'
          or (chunk_item ->> 'similarity_score')::double precision < 0
          or (chunk_item ->> 'similarity_score')::double precision > 1
          or (chunk_item ->> 'similarity_score')::double precision = 'NaN'::double precision
      )

    union all

    select
        'vector_similarity_score' as field_name,
        chunk_item ->> 'vector_similarity_score' as field_value
    from chunk_rows
    where chunk_item is not null
      and chunk_item ? 'vector_similarity_score'
      and jsonb_typeof(chunk_item -> 'vector_similarity_score') <> 'null'
      and (
          jsonb_typeof(chunk_item -> 'vector_similarity_score') <> 'number'
          or (chunk_item ->> 'vector_similarity_score')::double precision < 0
          or (chunk_item ->> 'vector_similarity_score')::double precision > 1
          or (chunk_item ->> 'vector_similarity_score')::double precision = 'NaN'::double precision
      )
)
select
    'retrieval_score_contract_violations' as check_group,
    count(*) as violation_count,
    case
        when count(*) = 0 then 'ok'
        else 'blocker: retrieval returned score fields outside persistence contract'
    end as expected_result
from violations;

-- 4. Runtime follow-up after deploy.
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
