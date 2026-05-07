-- Phase 8.3/8.4 verification: Knowledge Base ingestion pipeline versioning.
-- Run after applying:
-- - 20260501000100_add_kb_ingestion_pipeline_version.sql
-- - 20260501000200_bump_kb_ingestion_pipeline_v3.sql
-- - 20260504000100_bump_kb_ingestion_pipeline_v4.sql

-- 1. Expected DB pipeline version.
select public.get_kb_ingestion_pipeline_version_v1() as expected_pipeline_version;

select
  public.get_kb_ingestion_pipeline_version_v1() = 'kb_ingestion_v4' as expected_version_is_v4;

-- 2. Required columns exist and are not nullable.
select
  table_name,
  column_name,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('knowledge_chunk_sets', 'knowledge_chunks')
  and column_name = 'ingestion_pipeline_version'
order by table_name;

-- 3. Required constraints exist.
select conname
from pg_constraint
where conrelid in (
    'public.knowledge_chunk_sets'::regclass,
    'public.knowledge_chunks'::regclass
  )
  and conname in (
    'knowledge_chunk_sets_pipeline_version_format_check',
    'knowledge_chunk_sets_article_checksum_pipeline_unique',
    'knowledge_chunk_sets_last_error_type_check',
    'knowledge_chunks_pipeline_version_format_check'
  )
order by conname;

-- 4. Old checksum-only unique constraint must be gone.
select conname
from pg_constraint
where conrelid = 'public.knowledge_chunk_sets'::regclass
  and conname = 'knowledge_chunk_sets_article_checksum_unique';

-- 5. Active-set invariant is still present.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'knowledge_chunk_sets'
  and indexname in (
    'knowledge_chunk_sets_one_active_per_article',
    'knowledge_chunk_sets_one_processing_per_article'
  )
order by indexname;

-- 6. Existing rows were backfilled and no null versions remain.
select
  count(*) filter (where ingestion_pipeline_version is null) as null_chunk_set_versions,
  count(*) filter (where ingestion_pipeline_version = 'kb_ingestion_v1') as v1_chunk_sets,
  count(*) filter (where ingestion_pipeline_version = 'kb_ingestion_v2') as v2_chunk_sets,
  count(*) filter (where ingestion_pipeline_version = 'kb_ingestion_v3') as v3_chunk_sets,
  count(*) filter (where ingestion_pipeline_version = public.get_kb_ingestion_pipeline_version_v1()) as current_chunk_sets
from public.knowledge_chunk_sets;

select
  count(*) filter (where ingestion_pipeline_version is null) as null_chunk_versions,
  count(*) filter (where ingestion_pipeline_version = 'kb_ingestion_v1') as v1_chunks,
  count(*) filter (where ingestion_pipeline_version = 'kb_ingestion_v2') as v2_chunks,
  count(*) filter (where ingestion_pipeline_version = 'kb_ingestion_v3') as v3_chunks,
  count(*) filter (where ingestion_pipeline_version = public.get_kb_ingestion_pipeline_version_v1()) as current_chunks
from public.knowledge_chunks;

-- 7. Migration did not create pending chunk sets in bulk for existing v1 rows.
select
  ingestion_pipeline_version,
  status,
  count(*) as count
from public.knowledge_chunk_sets
group by ingestion_pipeline_version, status
order by ingestion_pipeline_version, status;

-- 7.1. Phase 8.4 v4 migration must not create pending v4 rows in bulk.
select
  count(*) filter (where ingestion_pipeline_version = 'kb_ingestion_v4') as v4_chunk_sets,
  count(*) filter (where ingestion_pipeline_version = 'kb_ingestion_v4' and status = 'pending') as pending_v4_chunk_sets
from public.knowledge_chunk_sets;

-- 7.2. Active older chunk sets should now be treated as outdated by the embedding state logic.
select
  a.id as article_id,
  s.id as active_chunk_set_id,
  s.ingestion_pipeline_version as active_pipeline_version,
  public.get_kb_ingestion_pipeline_version_v1() as expected_pipeline_version,
  case
    when s.ingestion_pipeline_version <> public.get_kb_ingestion_pipeline_version_v1()
      then 'outdated'
    else 'actual'
  end as inferred_embedding_status
from public.knowledge_base_articles a
join public.knowledge_chunk_sets s
  on s.article_id = a.id
 and s.is_active = true
 and s.ingestion_pipeline_version <> public.get_kb_ingestion_pipeline_version_v1()
order by a.updated_at desc
limit 20;

-- 8. No article has more than one active chunk set.
select article_id, count(*) as active_count
from public.knowledge_chunk_sets
where is_active = true
group by article_id
having count(*) > 1;

-- 9. Same checksum may now exist across different pipeline versions, but not inside one version.
select article_id, content_checksum, count(*) as versions_count
from public.knowledge_chunk_sets
group by article_id, content_checksum
having count(*) > 1
order by versions_count desc;

select article_id, content_checksum, ingestion_pipeline_version, count(*) as duplicate_count
from public.knowledge_chunk_sets
group by article_id, content_checksum, ingestion_pipeline_version
having count(*) > 1;

-- 10. Claim RPC should ignore stale pipeline versions.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'claim_kb_chunk_set_from_webhook',
    'claim_next_kb_chunk_set_for_ingestion',
    'complete_kb_chunk_set_ingestion',
    'get_kb_article_embedding_state_v1',
    'request_kb_article_embedding_refresh_v1'
  )
order by p.proname, arguments;
