-- Phase 6 verification: knowledge chunking schema and ingestion foundation.
-- Read-only checks. Do not create or alter schema from SQL Editor.

-- 1. pgvector must be installed.
select
  e.extname,
  e.extversion
from pg_extension e
where e.extname = 'vector';

-- 2. Foundation tables must exist.
select
  to_regclass('public.knowledge_chunk_sets') is not null as chunk_sets_exists,
  to_regclass('public.knowledge_chunks') is not null as chunks_exists;

-- 3. knowledge_chunk_sets expected columns.
select
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'knowledge_chunk_sets'
  and column_name in (
    'id',
    'article_id',
    'content_checksum',
    'embedding_provider',
    'embedding_model',
    'embedding_dimension',
    'status',
    'is_active',
    'chunk_count',
    'embedded_chunks_count',
    'attempt_count',
    'last_attempt_at',
    'processing_started_at',
    'completed_at',
    'error_message',
    'created_at',
    'updated_at'
  )
order by column_name;

-- 4. knowledge_chunks expected columns, including vector(384).
select
  a.attname as column_name,
  format_type(a.atttypid, a.atttypmod) as formatted_type,
  a.attnotnull as is_not_null
from pg_attribute a
where a.attrelid = 'public.knowledge_chunks'::regclass
  and a.attnum > 0
  and not a.attisdropped
  and a.attname in (
    'id',
    'chunk_set_id',
    'article_id',
    'chunk_index',
    'chunk_text',
    'content_checksum',
    'embedding',
    'embedding_status',
    'embedding_error',
    'created_at',
    'updated_at'
  )
order by a.attname;

-- Expected: embedding formatted_type = vector(384).
select
  format_type(a.atttypid, a.atttypmod) as embedding_type
from pg_attribute a
where a.attrelid = 'public.knowledge_chunks'::regclass
  and a.attname = 'embedding';

-- 5. Constraints must include lifecycle, active, uniqueness, and FK guards.
select
  conname,
  contype,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
    'public.knowledge_chunk_sets'::regclass,
    'public.knowledge_chunks'::regclass
  )
  and conname in (
    'knowledge_chunk_sets_checksum_format_check',
    'knowledge_chunk_sets_embedding_dimension_check',
    'knowledge_chunk_sets_status_check',
    'knowledge_chunk_sets_active_completed_check',
    'knowledge_chunk_sets_completed_at_check',
    'knowledge_chunk_sets_counts_check',
    'knowledge_chunk_sets_article_checksum_unique',
    'knowledge_chunks_chunk_set_fk',
    'knowledge_chunks_article_fk',
    'knowledge_chunks_chunk_index_check',
    'knowledge_chunks_embedding_status_check',
    'knowledge_chunks_completed_embedding_check',
    'knowledge_chunks_set_index_unique'
  )
order by conname;

-- 6. Partial unique active-set invariant must exist.
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'knowledge_chunk_sets'
  and indexname = 'knowledge_chunk_sets_one_active_per_article';

-- Expected indexdef contains: UNIQUE ... WHERE (is_active = true)

-- 7. Queue/retrieval support indexes must exist.
select
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'knowledge_chunk_sets_ingestion_queue_idx',
    'knowledge_chunk_sets_processing_started_idx',
    'knowledge_chunk_sets_article_created_idx',
    'knowledge_chunks_article_set_idx',
    'knowledge_chunks_retrieval_filter_idx'
  )
order by tablename, indexname;

-- 8. Helper functions must exist.
select
  p.proname,
  pg_get_function_result(p.oid) as result_type,
  pg_get_function_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'normalize_kb_content_for_ingestion',
    'calculate_kb_content_checksum',
    'ensure_kb_pending_chunk_set'
  )
order by p.proname;

-- 9. Canonical checksum must ignore whitespace-only differences.
select
  public.calculate_kb_content_checksum('Reset password', 'Use email link') =
  public.calculate_kb_content_checksum('  Reset   password ', E'Use\nemail\tlink  ')
  as whitespace_normalization_ok;

-- 10. KB RPC signatures should still exist.
select
  p.proname,
  pg_get_function_result(p.oid) as result_type,
  pg_get_function_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_kb_article_v1',
    'update_kb_article_v1',
    'archive_kb_article_v1',
    'restore_kb_article_v1',
    'delete_kb_article_v1'
  )
order by p.proname, arguments;

-- 11. Current data audit: active chunk set duplicates.
-- Expected: 0 rows.
select
  article_id,
  count(*) as active_sets_count
from public.knowledge_chunk_sets
where is_active = true
group by article_id
having count(*) > 1;

-- 12. Current data audit: duplicate checksum sets.
-- Expected: 0 rows.
select
  article_id,
  content_checksum,
  count(*) as duplicate_sets_count
from public.knowledge_chunk_sets
group by article_id, content_checksum
having count(*) > 1;

-- 13. Current data audit: invalid active non-completed sets.
-- Expected: 0 rows.
select
  id,
  article_id,
  status,
  is_active
from public.knowledge_chunk_sets
where is_active = true
  and status <> 'completed';

-- 14. Current data audit: orphan chunks.
-- Expected: 0 rows.
select
  c.id,
  c.chunk_set_id,
  c.article_id
from public.knowledge_chunks c
left join public.knowledge_chunk_sets s
  on s.id = c.chunk_set_id
 and s.article_id = c.article_id
 and s.content_checksum = c.content_checksum
where s.id is null;

-- 15. Current data audit: chunk debug fields inconsistent with chunk set.
-- Expected: 0 rows.
select
  c.id,
  c.chunk_set_id,
  c.article_id as chunk_article_id,
  s.article_id as set_article_id,
  c.content_checksum as chunk_checksum,
  s.content_checksum as set_checksum
from public.knowledge_chunks c
join public.knowledge_chunk_sets s on s.id = c.chunk_set_id
where c.article_id is distinct from s.article_id
   or c.content_checksum is distinct from s.content_checksum;

-- 16. Current data audit: completed sets without completed_at.
-- Expected: 0 rows.
select
  id,
  article_id,
  status,
  completed_at
from public.knowledge_chunk_sets
where status = 'completed'
  and completed_at is null;

-- 17. Retrieval-ready filter shape for future phases.
-- This should run successfully. It may return 0 rows before Phase 7 ingestion.
select
  c.id as chunk_id,
  c.article_id,
  c.chunk_set_id,
  c.chunk_index,
  left(c.chunk_text, 120) as chunk_preview
from public.knowledge_chunks c
join public.knowledge_chunk_sets s on s.id = c.chunk_set_id
join public.knowledge_base_articles a on a.id = c.article_id
where s.is_active = true
  and s.status = 'completed'
  and c.embedding_status = 'completed'
  and a.status = 'published'
order by c.article_id, c.chunk_index
limit 20;
