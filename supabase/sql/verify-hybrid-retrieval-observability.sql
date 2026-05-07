-- Post-main verification: Hybrid Retrieval Observability.
-- Read-only. Do not expose raw context_snapshot, prompt_snapshot, provider payloads, or full retrieval chunks.

-- 1. Confirm RPC signatures and backend-only execute grants.
select
    p.proname,
    pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result,
    pg_get_userbyid(p.proowner) as owner,
    p.prosecdef as security_definer,
    has_function_privilege('public', p.oid, 'execute') as public_can_execute,
    has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
    has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
    has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
      'match_knowledge_chunks_v1',
      'save_chat_ai_retrieval_result'
  )
order by p.proname, arguments;

-- 2. Recent run summary without raw snapshots.
select
    r.id as run_id,
    r.status,
    r.retrieval_status,
    r.response_kind,
    r.matched_chunks_count,
    jsonb_array_length(coalesce(r.retrieval_chunks, '[]'::jsonb)) as retrieval_chunks_length,
    r.top_similarity_score,
    r.created_at,
    r.completed_at
from public.chat_ai_runs r
where r.created_at >= now() - interval '48 hours'
order by r.created_at desc
limit 30;

-- 3. Safe diagnostics preview for recent hits.
select
    r.id as run_id,
    (chunk_item.ordinality - 1) as chunk_index,
    chunk_item.value ->> 'match_source' as match_source,
    (chunk_item.value ->> 'similarity_score')::double precision as similarity_score,
    case
        when jsonb_typeof(chunk_item.value -> 'vector_similarity_score') = 'number'
        then (chunk_item.value ->> 'vector_similarity_score')::double precision
        else null
    end as vector_similarity_score,
    case
        when jsonb_typeof(chunk_item.value -> 'fts_score') = 'number'
        then (chunk_item.value ->> 'fts_score')::double precision
        else null
    end as fts_score,
    case
        when jsonb_typeof(chunk_item.value -> 'trigram_score') = 'number'
        then (chunk_item.value ->> 'trigram_score')::double precision
        else null
    end as trigram_score,
    case
        when jsonb_typeof(chunk_item.value -> 'retrieval_rank') = 'number'
        then (chunk_item.value ->> 'retrieval_rank')::double precision
        else null
    end as retrieval_rank
from public.chat_ai_runs r
cross join lateral jsonb_array_elements(r.retrieval_chunks) with ordinality as chunk_item(value, ordinality)
where r.created_at >= now() - interval '48 hours'
  and r.retrieval_status = 'hit'
order by r.created_at desc, chunk_item.ordinality
limit 50;

-- 4. Violations: chunk array shape, required compatibility fields, optional diagnostics type/range.
with chunk_rows as (
    select
        r.id as run_id,
        r.retrieval_status,
        r.matched_chunks_count,
        jsonb_array_length(coalesce(r.retrieval_chunks, '[]'::jsonb)) as chunk_count,
        (chunk_item.ordinality - 1) as chunk_index,
        chunk_item.value as chunk_item
    from public.chat_ai_runs r
    left join lateral jsonb_array_elements(coalesce(r.retrieval_chunks, '[]'::jsonb)) with ordinality as chunk_item(value, ordinality)
        on true
    where r.retrieval_chunks is not null
),
violations as (
    select
        r.id as run_id,
        null::integer as chunk_index,
        'top_similarity_score' as field_name,
        'top_similarity_score outside 0..1 or NaN' as violation
    from public.chat_ai_runs r
    where r.top_similarity_score is not null
      and (
          r.top_similarity_score < 0
          or r.top_similarity_score > 1
          or r.top_similarity_score = 'NaN'::double precision
      )

    union all

    select
        run_id,
        null::integer as chunk_index,
        'matched_chunks_count' as field_name,
        'matched_chunks_count does not match retrieval_chunks length' as violation
    from chunk_rows
    group by run_id, retrieval_status, matched_chunks_count, chunk_count
    having max(chunk_count) <> coalesce(matched_chunks_count, -1)

    union all

    select
        run_id,
        null::integer as chunk_index,
        'retrieval_chunks' as field_name,
        'miss/empty/failed run has unexpected chunks' as violation
    from chunk_rows
    group by run_id, retrieval_status, matched_chunks_count, chunk_count
    having retrieval_status in ('miss', 'empty', 'failed')
       and max(chunk_count) <> 0

    union all

    select run_id, chunk_index, 'chunk_id', 'missing or invalid uuid'
    from chunk_rows
    where chunk_item is not null
      and (
          jsonb_typeof(chunk_item) <> 'object'
          or not (chunk_item ? 'chunk_id')
          or (chunk_item ->> 'chunk_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )

    union all

    select run_id, chunk_index, 'article_id', 'missing or invalid uuid'
    from chunk_rows
    where chunk_item is not null
      and (
          jsonb_typeof(chunk_item) <> 'object'
          or not (chunk_item ? 'article_id')
          or (chunk_item ->> 'article_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )

    union all

    select run_id, chunk_index, 'chunk_index', 'missing or invalid non-negative integer'
    from chunk_rows
    where chunk_item is not null
      and (
          not (chunk_item ? 'chunk_index')
          or jsonb_typeof(chunk_item -> 'chunk_index') <> 'number'
          or (chunk_item ->> 'chunk_index') !~ '^[0-9]+$'
      )

    union all

    select run_id, chunk_index, 'similarity_score', 'missing or outside 0..1'
    from chunk_rows
    where chunk_item is not null
      and (
          not (chunk_item ? 'similarity_score')
          or jsonb_typeof(chunk_item -> 'similarity_score') <> 'number'
          or case
              when jsonb_typeof(chunk_item -> 'similarity_score') = 'number'
              then (chunk_item ->> 'similarity_score')::double precision < 0
                   or (chunk_item ->> 'similarity_score')::double precision > 1
                   or (chunk_item ->> 'similarity_score')::double precision = 'NaN'::double precision
              else false
          end
      )

    union all

    select run_id, chunk_index, 'match_source', 'invalid optional match_source'
    from chunk_rows
    where chunk_item is not null
      and chunk_item ? 'match_source'
      and jsonb_typeof(chunk_item -> 'match_source') <> 'null'
      and (
          jsonb_typeof(chunk_item -> 'match_source') <> 'string'
          or chunk_item ->> 'match_source' not in ('vector', 'fts', 'trigram', 'hybrid')
      )

    union all

    select run_id, chunk_index, 'vector_similarity_score', 'optional score outside 0..1'
    from chunk_rows
    where chunk_item is not null
      and chunk_item ? 'vector_similarity_score'
      and jsonb_typeof(chunk_item -> 'vector_similarity_score') <> 'null'
      and (
          jsonb_typeof(chunk_item -> 'vector_similarity_score') <> 'number'
          or case
              when jsonb_typeof(chunk_item -> 'vector_similarity_score') = 'number'
              then (chunk_item ->> 'vector_similarity_score')::double precision < 0
                   or (chunk_item ->> 'vector_similarity_score')::double precision > 1
                   or (chunk_item ->> 'vector_similarity_score')::double precision = 'NaN'::double precision
              else false
          end
      )

    union all

    select run_id, chunk_index, 'fts_score', 'optional score is negative'
    from chunk_rows
    where chunk_item is not null
      and chunk_item ? 'fts_score'
      and jsonb_typeof(chunk_item -> 'fts_score') <> 'null'
      and (
          jsonb_typeof(chunk_item -> 'fts_score') <> 'number'
          or case
              when jsonb_typeof(chunk_item -> 'fts_score') = 'number'
              then (chunk_item ->> 'fts_score')::double precision < 0
                   or (chunk_item ->> 'fts_score')::double precision = 'NaN'::double precision
              else false
          end
      )

    union all

    select run_id, chunk_index, 'trigram_score', 'optional score outside 0..1'
    from chunk_rows
    where chunk_item is not null
      and chunk_item ? 'trigram_score'
      and jsonb_typeof(chunk_item -> 'trigram_score') <> 'null'
      and (
          jsonb_typeof(chunk_item -> 'trigram_score') <> 'number'
          or case
              when jsonb_typeof(chunk_item -> 'trigram_score') = 'number'
              then (chunk_item ->> 'trigram_score')::double precision < 0
                   or (chunk_item ->> 'trigram_score')::double precision > 1
                   or (chunk_item ->> 'trigram_score')::double precision = 'NaN'::double precision
              else false
          end
      )

    union all

    select run_id, chunk_index, 'retrieval_rank', 'optional rank is negative'
    from chunk_rows
    where chunk_item is not null
      and chunk_item ? 'retrieval_rank'
      and jsonb_typeof(chunk_item -> 'retrieval_rank') <> 'null'
      and (
          jsonb_typeof(chunk_item -> 'retrieval_rank') <> 'number'
          or case
              when jsonb_typeof(chunk_item -> 'retrieval_rank') = 'number'
              then (chunk_item ->> 'retrieval_rank')::double precision < 0
                   or (chunk_item ->> 'retrieval_rank')::double precision = 'NaN'::double precision
              else false
          end
      )
)
select
    run_id,
    chunk_index,
    field_name,
    violation
from violations
order by run_id, chunk_index nulls first, field_name;

-- 5. Old compatibility: old hit chunks without diagnostics are allowed and counted, not flagged.
select
    count(*) as hit_chunks_without_diagnostics
from public.chat_ai_runs r
cross join lateral jsonb_array_elements(r.retrieval_chunks) as chunk_item(value)
where r.retrieval_status = 'hit'
  and not (
      chunk_item.value ? 'match_source'
      or chunk_item.value ? 'vector_similarity_score'
      or chunk_item.value ? 'fts_score'
      or chunk_item.value ? 'trigram_score'
      or chunk_item.value ? 'retrieval_rank'
  );
