-- Verification for retrieval chunk article_id validation fix.
-- Read-only script. Run in Supabase SQL Editor after applying:
-- supabase/migrations/20260507000800_fix_retrieval_chunk_article_id_validation.sql
--
-- Rules:
-- - Do not add schema mutations here.
-- - Do not select raw user text, prompt/context/config snapshots, provider payloads, or secrets.

-- 1. Retrieval persistence RPC metadata remains backend-only.
select
    'save_retrieval_rpc_metadata' as check_group,
    p.oid::regprocedure::text as function_signature,
    pg_get_function_result(p.oid) as result_type,
    pg_get_userbyid(p.proowner) as owner,
    p.prosecdef as security_definer,
    p.proconfig as function_config,
    case
        when p.prosecdef
             and pg_get_userbyid(p.proowner) = 'postgres'
             and p.proconfig @> array['search_path=public']
             and pg_get_function_result(p.oid) = 'jsonb'
            then 'ok'
        else 'blocker: save retrieval rpc metadata/security changed unexpectedly'
    end as expected_result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid = 'public.save_chat_ai_retrieval_result(uuid, text, text, double precision, integer, jsonb, text, text)'::regprocedure;

-- 2. Function privileges remain backend-only.
select
    'save_retrieval_rpc_privileges' as check_group,
    role_name,
    has_function_privilege(
        role_name,
        'public.save_chat_ai_retrieval_result(uuid, text, text, double precision, integer, jsonb, text, text)'::regprocedure,
        'EXECUTE'
    ) as has_execute,
    case
        when role_name = 'service_role'
             and has_function_privilege(role_name, 'public.save_chat_ai_retrieval_result(uuid, text, text, double precision, integer, jsonb, text, text)'::regprocedure, 'EXECUTE')
            then 'ok'
        when role_name = 'service_role'
            then 'blocker: service_role cannot execute save retrieval rpc'
        when has_function_privilege(role_name, 'public.save_chat_ai_retrieval_result(uuid, text, text, double precision, integer, jsonb, text, text)'::regprocedure, 'EXECUTE')
            then 'blocker: browser-facing role can execute save retrieval rpc'
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

-- 3. Function definition contains the full UUID validation for article_id.
with function_definition as (
    select pg_get_functiondef(
        'public.save_chat_ai_retrieval_result(uuid, text, text, double precision, integer, jsonb, text, text)'::regprocedure
    ) as definition
)
select
    'article_id_uuid_regex_contract' as check_group,
    definition like '%article_id%' as contains_article_id_validation,
    definition like '%article_id%' || '%' || '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' || '%' as contains_full_uuid_regex,
    case
        when definition like '%article_id%' || '%' || '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' || '%'
            then 'ok'
        else 'blocker: article_id validation does not use full UUID regex'
    end as expected_result
from function_definition;

-- 4. Direct retrieval hit chunks expose UUID-shaped article_id values.
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
    select chunk_item.value as chunk_item
    from rpc_result
    left join lateral jsonb_array_elements(coalesce(result -> 'chunks', '[]'::jsonb)) as chunk_item(value)
        on true
    where chunk_item.value is not null
),
violations as (
    select chunk_item
    from chunk_rows
    where chunk_item ->> 'article_id' is null
       or (chunk_item ->> 'article_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
select
    'retrieval_chunk_article_id_shape' as check_group,
    (select count(*) from chunk_rows) as chunk_count,
    (select count(*) from violations) as violation_count,
    case
        when (select count(*) from violations) = 0 then 'ok'
        else 'blocker: retrieval chunks contain invalid article_id shape'
    end as expected_result;

-- 5. Direct retrieval hit chunks satisfy the persistence validator shape checks.
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
    select chunk_item.value as chunk_item
    from rpc_result
    left join lateral jsonb_array_elements(coalesce(result -> 'chunks', '[]'::jsonb)) as chunk_item(value)
        on true
    where chunk_item.value is not null
),
violations as (
    select 'chunk_id_uuid' as violation_type
    from chunk_rows
    where chunk_item ->> 'chunk_id' is null
       or (chunk_item ->> 'chunk_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

    union all

    select 'article_id_uuid' as violation_type
    from chunk_rows
    where chunk_item ->> 'article_id' is null
       or (chunk_item ->> 'article_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

    union all

    select 'chunk_index' as violation_type
    from chunk_rows
    where jsonb_typeof(chunk_item -> 'chunk_index') <> 'number'
       or (chunk_item ->> 'chunk_index') !~ '^[0-9]+$'

    union all

    select 'similarity_score' as violation_type
    from chunk_rows
    where jsonb_typeof(chunk_item -> 'similarity_score') <> 'number'
       or (chunk_item ->> 'similarity_score')::double precision < 0
       or (chunk_item ->> 'similarity_score')::double precision > 1
       or (chunk_item ->> 'similarity_score')::double precision = 'NaN'::double precision

    union all

    select 'vector_similarity_score' as violation_type
    from chunk_rows
    where chunk_item ? 'vector_similarity_score'
      and jsonb_typeof(chunk_item -> 'vector_similarity_score') = 'number'
      and (
          (chunk_item ->> 'vector_similarity_score')::double precision < 0
          or (chunk_item ->> 'vector_similarity_score')::double precision > 1
          or (chunk_item ->> 'vector_similarity_score')::double precision = 'NaN'::double precision
      )

    union all

    select 'fts_score' as violation_type
    from chunk_rows
    where chunk_item ? 'fts_score'
      and jsonb_typeof(chunk_item -> 'fts_score') = 'number'
      and (
          (chunk_item ->> 'fts_score')::double precision < 0
          or (chunk_item ->> 'fts_score')::double precision = 'NaN'::double precision
      )

    union all

    select 'trigram_score' as violation_type
    from chunk_rows
    where chunk_item ? 'trigram_score'
      and jsonb_typeof(chunk_item -> 'trigram_score') = 'number'
      and (
          (chunk_item ->> 'trigram_score')::double precision < 0
          or (chunk_item ->> 'trigram_score')::double precision > 1
          or (chunk_item ->> 'trigram_score')::double precision = 'NaN'::double precision
      )

    union all

    select 'retrieval_rank' as violation_type
    from chunk_rows
    where chunk_item ? 'retrieval_rank'
      and jsonb_typeof(chunk_item -> 'retrieval_rank') = 'number'
      and (
          (chunk_item ->> 'retrieval_rank')::double precision < 0
          or (chunk_item ->> 'retrieval_rank')::double precision = 'NaN'::double precision
      )
)
select
    'retrieval_chunk_persistence_shape' as check_group,
    coalesce(violation_type, 'none') as violation_type,
    count(violation_type) as violation_count,
    case
        when violation_type is null then 'ok'
        else 'blocker: retrieval chunks still violate persistence validation'
    end as expected_result
from violations
right join (select 1 as keep_row) keep_row on true
group by violation_type
order by violation_type nulls first;

-- 6. Runtime follow-up after deploy.
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
