-- Phase 8 verification: Knowledge Base retrieval policy.
-- Read-only checks only. Do not use this file for schema changes.

-- 1. chat_ai_runs retrieval columns.
select
    column_name,
    data_type,
    is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'chat_ai_runs'
  and column_name in (
      'retrieval_status',
      'top_similarity_score',
      'retrieval_chunks',
      'matched_chunks_count'
  )
order by column_name;

-- 2. Phase 8 constraints.
select
    conname,
    pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.chat_ai_runs'::regclass
  and conname in (
      'chat_ai_runs_retrieval_status_check',
      'chat_ai_runs_retrieval_chunks_check',
      'chat_ai_runs_matched_chunks_count_check'
  )
order by conname;

-- 3. Retrieval RPCs exist.
select
    p.proname,
    pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result,
    p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
      'match_knowledge_chunks_v1',
      'save_chat_ai_retrieval_result'
  )
order by p.proname;

-- 4. Function execute privileges should be backend-only.
select
    p.proname,
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
order by p.proname;

-- 5. Vector index exists.
select
    indexname,
    indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'knowledge_chunks'
  and indexname = 'knowledge_chunks_embedding_cosine_idx';

-- 6. Planner statistics should be refreshed after ivfflat index creation.
-- Expected: last_analyze or last_autoanalyze is not null after manual ANALYZE/auto-analyze.
select
    relname,
    last_analyze,
    last_autoanalyze
from pg_stat_all_tables
where schemaname = 'public'
  and relname = 'knowledge_chunks';

-- 7. Completed chunks should have vector(384).
select
    id,
    article_id,
    chunk_set_id,
    embedding_status,
    vector_dims(embedding) as embedding_dimensions
from public.knowledge_chunks
where embedding_status = 'completed'
  and (
      embedding is null
      or vector_dims(embedding) <> 384
  );

-- 8. Policy-eligible chunks preview.
select
    kc.id as chunk_id,
    kc.article_id,
    kc.chunk_index,
    article.status as article_status,
    kcs.status as chunk_set_status,
    kcs.is_active,
    kc.embedding_status,
    vector_dims(kc.embedding) as embedding_dimensions
from public.knowledge_chunks kc
join public.knowledge_chunk_sets kcs on kcs.id = kc.chunk_set_id
join public.knowledge_base_articles article on article.id = kc.article_id
where kcs.is_active = true
  and kcs.status = 'completed'
  and kc.embedding_status = 'completed'
  and kc.embedding is not null
  and article.status = 'published'::public.article_status
order by kc.created_at desc, kc.id desc
limit 20;

-- 9. Retrieval snapshot shape should stay lightweight.
select
    id,
    retrieval_status,
    matched_chunks_count,
    jsonb_array_length(retrieval_chunks) as retrieval_chunks_length,
    retrieval_chunks
from public.chat_ai_runs
where retrieval_chunks is not null
  and (
      jsonb_typeof(retrieval_chunks) <> 'array'
      or jsonb_array_length(retrieval_chunks) <> coalesce(matched_chunks_count, -1)
      or jsonb_array_length(retrieval_chunks) > 20
      or exists (
          select 1
          from jsonb_array_elements(retrieval_chunks) as chunk_item
          where jsonb_typeof(chunk_item) <> 'object'
             or not (chunk_item ? 'chunk_id')
             or not (chunk_item ? 'article_id')
             or not (chunk_item ? 'chunk_index')
             or not (chunk_item ? 'similarity_score')
             or (chunk_item ->> 'chunk_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             or (chunk_item ->> 'article_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             or chunk_item ? 'chunk_text'
             or chunk_item ? 'article_title'
             or chunk_item ? 'article_slug'
             or jsonb_typeof(chunk_item -> 'chunk_index') <> 'number'
             or jsonb_typeof(chunk_item -> 'similarity_score') <> 'number'
             or (chunk_item ->> 'chunk_index') !~ '^[0-9]+$'
             or case
                    when jsonb_typeof(chunk_item -> 'similarity_score') = 'number'
                    then (chunk_item ->> 'similarity_score')::double precision < 0
                         or (chunk_item ->> 'similarity_score')::double precision > 1
                         or (chunk_item ->> 'similarity_score')::double precision = 'NaN'::double precision
                    else false
                end
      )
  );

-- 10. Retrieval status consistency.
select
    id,
    retrieval_status,
    top_similarity_score,
    matched_chunks_count,
    retrieval_chunks
from public.chat_ai_runs
where retrieval_status in ('hit', 'miss', 'empty')
  and (
      (retrieval_status = 'hit' and coalesce(matched_chunks_count, 0) <= 0)
      or (retrieval_status in ('miss', 'empty') and coalesce(matched_chunks_count, 0) <> 0)
      or coalesce(jsonb_array_length(retrieval_chunks), -1) <> coalesce(matched_chunks_count, -1)
      or (retrieval_status = 'empty' and top_similarity_score is not null)
      or (retrieval_status = 'miss' and top_similarity_score is null)
      or (top_similarity_score is not null and (top_similarity_score < 0 or top_similarity_score > 1))
  );
