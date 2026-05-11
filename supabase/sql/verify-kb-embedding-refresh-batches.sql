-- Knowledge Base embeddings batch refresh verification.
-- Read-only checks for Supabase SQL Editor after applying:
-- - 20260511000200_add_kb_embedding_refresh_batches.sql

-- 1. Tables exist.
select
    table_schema,
    table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
      'knowledge_embedding_refresh_batches',
      'knowledge_embedding_refresh_batch_items'
  )
order by table_name;

-- 2. Required constraints exist.
select
    conrelid::regclass as table_name,
    conname as constraint_name,
    contype as constraint_type
from pg_constraint
where conrelid in (
    'public.knowledge_embedding_refresh_batches'::regclass,
    'public.knowledge_embedding_refresh_batch_items'::regclass
)
order by conrelid::regclass::text, conname;

-- 3. Required indexes exist.
select
    schemaname,
    tablename,
    indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
      'knowledge_embedding_refresh_one_running_batch',
      'knowledge_embedding_refresh_batches_created_idx',
      'knowledge_embedding_refresh_batch_items_queue_idx',
      'knowledge_embedding_refresh_batch_items_errors_idx'
  )
order by indexname;

-- 4. RPC functions exist.
select
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
      'get_kb_embeddings_summary_v1',
      'get_kb_embedding_refresh_batch_state_v1',
      'create_kb_embedding_refresh_batch_v1',
      'claim_next_kb_embedding_refresh_batch_item_v1',
      'request_kb_embedding_refresh_for_batch_item_v1',
      'finish_kb_embedding_refresh_batch_item_v1',
      'recalculate_kb_embedding_refresh_batch_v1'
  )
order by p.proname, arguments;

-- 5. Function execute grants.
select
    routine_name,
    grantee,
    privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
      'get_kb_embeddings_summary_v1',
      'get_kb_embedding_refresh_batch_state_v1',
      'create_kb_embedding_refresh_batch_v1',
      'claim_next_kb_embedding_refresh_batch_item_v1',
      'request_kb_embedding_refresh_for_batch_item_v1',
      'finish_kb_embedding_refresh_batch_item_v1',
      'recalculate_kb_embedding_refresh_batch_v1'
  )
order by routine_name, grantee;

-- 6. Current summary shape for the signed-in manager.
select public.get_kb_embeddings_summary_v1() as embeddings_summary;

-- 7. Direct article classification used to validate the summary counts.
with pipeline as (
    select public.get_kb_ingestion_pipeline_version_v1() as version
),
article_state as (
    select
        a.id,
        a.title,
        a.status as article_status,
        count(current_set.id)::integer as current_count,
        count(active_set.id)::integer as active_count,
        (array_agg(current_set.id order by current_set.created_at desc, current_set.id desc)
            filter (where current_set.id is not null))[1] as current_chunk_set_id,
        (array_agg(current_set.status order by current_set.created_at desc, current_set.id desc)
            filter (where current_set.id is not null))[1] as current_chunk_set_status,
        bool_or(current_set.is_active) as current_is_active
    from public.knowledge_base_articles a
    cross join pipeline p
    left join public.knowledge_chunk_sets current_set
        on current_set.article_id = a.id
       and current_set.content_checksum = public.calculate_kb_content_checksum(a.title, a.content)
       and current_set.ingestion_pipeline_version = p.version
    left join public.knowledge_chunk_sets active_set
        on active_set.article_id = a.id
       and active_set.is_active = true
    where a.status <> 'archived'::public.article_status
    group by a.id, a.title, a.status
),
classified as (
    select
        *,
        case
            when article_status <> 'published'::public.article_status then 'unavailable'
            when current_count > 1 or active_count > 1 then 'unavailable'
            when current_chunk_set_id is null then 'outdated'
            when current_chunk_set_status in ('pending', 'processing') then 'updating'
            when current_chunk_set_status = 'failed' then 'failed'
            when current_chunk_set_status = 'completed' and current_is_active is true then 'actual'
            when current_chunk_set_status = 'completed' and current_is_active is not true then 'outdated'
            else 'unavailable'
        end as embedding_status
    from article_state
)
select
    embedding_status,
    count(*) as article_count
from classified
group by embedding_status
order by embedding_status;

-- 8. Direct article-level classification sample.
with pipeline as (
    select public.get_kb_ingestion_pipeline_version_v1() as version
),
article_state as (
    select
        a.id,
        a.title,
        a.status as article_status,
        count(current_set.id)::integer as current_count,
        count(active_set.id)::integer as active_count,
        (array_agg(current_set.id order by current_set.created_at desc, current_set.id desc)
            filter (where current_set.id is not null))[1] as current_chunk_set_id,
        (array_agg(current_set.status order by current_set.created_at desc, current_set.id desc)
            filter (where current_set.id is not null))[1] as current_chunk_set_status,
        bool_or(current_set.is_active) as current_is_active
    from public.knowledge_base_articles a
    cross join pipeline p
    left join public.knowledge_chunk_sets current_set
        on current_set.article_id = a.id
       and current_set.content_checksum = public.calculate_kb_content_checksum(a.title, a.content)
       and current_set.ingestion_pipeline_version = p.version
    left join public.knowledge_chunk_sets active_set
        on active_set.article_id = a.id
       and active_set.is_active = true
    where a.status <> 'archived'::public.article_status
    group by a.id, a.title, a.status, a.updated_at
    order by a.updated_at desc
    limit 20
)
select
    id as article_id,
    title,
    article_status,
    case
        when article_status <> 'published'::public.article_status then 'unavailable'
        when current_count > 1 or active_count > 1 then 'unavailable'
        when current_chunk_set_id is null then 'outdated'
        when current_chunk_set_status in ('pending', 'processing') then 'updating'
        when current_chunk_set_status = 'failed' then 'failed'
        when current_chunk_set_status = 'completed' and current_is_active is true then 'actual'
        when current_chunk_set_status = 'completed' and current_is_active is not true then 'outdated'
        else 'unavailable'
    end as embedding_status,
    current_chunk_set_id,
    current_chunk_set_status,
    current_is_active,
    active_count
from article_state
order by title;

-- 9. Current/last batch shape for the signed-in manager.
select public.get_kb_embedding_refresh_batch_state_v1() as batch_state;

-- 10. Existing running batches.
select
    id,
    status,
    total_count,
    processed_count,
    completed_count,
    failed_count,
    skipped_count,
    started_at,
    completed_at
from public.knowledge_embedding_refresh_batches
where status = 'running'
order by created_at desc;
