-- Phase 7 verification: Knowledge Base ingestion execution pipeline.
-- Read-only checks only. Do not use this file for schema changes.

-- 1. Worker lifecycle columns.
select
    column_name,
    data_type,
    is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'knowledge_chunk_sets'
  and column_name in (
      'processing_token',
      'processing_heartbeat_at',
      'last_error_type',
      'last_run_id'
  )
order by column_name;

-- 2. Phase 7 constraints.
select
    conname,
    pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.knowledge_chunk_sets'::regclass
  and conname in (
      'knowledge_chunk_sets_last_error_type_check',
      'knowledge_chunk_sets_processing_owner_check'
  )
order by conname;

-- 3. Phase 7 indexes.
select
    indexname,
    indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'knowledge_chunk_sets'
  and indexname in (
      'knowledge_chunk_sets_retry_queue_idx',
      'knowledge_chunk_sets_heartbeat_idx'
  )
order by indexname;

-- 4. Phase 7 RPC/functions exist.
select
    p.proname,
    pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
      'claim_kb_chunk_set_from_webhook',
      'claim_next_kb_chunk_set_for_ingestion',
      'heartbeat_kb_chunk_set_ingestion',
      'complete_kb_chunk_set_ingestion',
      'fail_kb_chunk_set_ingestion'
  )
order by p.proname;

-- 5. Function execute privileges should not be public.
select
    p.proname,
    has_function_privilege(
        'public',
        p.oid,
        'execute'
    ) as public_can_execute,
    has_function_privilege(
        'anon',
        p.oid,
        'execute'
    ) as anon_can_execute,
    has_function_privilege(
        'authenticated',
        p.oid,
        'execute'
    ) as authenticated_can_execute,
    has_function_privilege(
        'service_role',
        p.oid,
        'execute'
    ) as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
      'claim_kb_chunk_set_from_webhook',
      'claim_next_kb_chunk_set_for_ingestion',
      'heartbeat_kb_chunk_set_ingestion',
      'complete_kb_chunk_set_ingestion',
      'fail_kb_chunk_set_ingestion'
  )
order by p.proname;

-- 6. Processing rows must have ownership and heartbeat.
select
    id,
    article_id,
    status,
    processing_started_at,
    processing_heartbeat_at
from public.knowledge_chunk_sets
where status = 'processing'
  and (
      processing_token is null
      or btrim(processing_token) = ''
      or processing_started_at is null
      or processing_heartbeat_at is null
  );

-- 7. Failed rows should have retry classification.
select
    id,
    article_id,
    status,
    attempt_count,
    last_error_type,
    error_message
from public.knowledge_chunk_sets
where status = 'failed'
  and last_error_type is null;

-- 7.1. Failed rows should not keep worker ownership fields.
select
    id,
    article_id,
    status,
    processing_token,
    processing_heartbeat_at
from public.knowledge_chunk_sets
where status = 'failed'
  and (
      processing_token is not null
      or processing_heartbeat_at is not null
  );

-- 8. Active invariant should still hold.
select
    article_id,
    count(*) as active_count
from public.knowledge_chunk_sets
where is_active = true
group by article_id
having count(*) > 1;

-- 9. Completed active sets should have completed chunks.
select
    s.id,
    s.article_id,
    s.chunk_count,
    s.embedded_chunks_count,
    count(c.id) as actual_chunks
from public.knowledge_chunk_sets s
left join public.knowledge_chunks c on c.chunk_set_id = s.id
where s.status = 'completed'
  and s.is_active = true
group by s.id, s.article_id, s.chunk_count, s.embedded_chunks_count
having s.chunk_count <> count(c.id)
    or s.embedded_chunks_count <> count(c.id);

-- 10. Retry queue preview.
select
    id,
    article_id,
    status,
    attempt_count,
    last_error_type,
    last_attempt_at,
    processing_started_at,
    processing_heartbeat_at,
    created_at
from public.knowledge_chunk_sets
where status = 'pending'
   or (
       status = 'failed'
       and last_error_type in ('external', 'system')
       and attempt_count < 3
   )
   or (
       status = 'processing'
       and coalesce(processing_heartbeat_at, processing_started_at) <= now() - interval '5 minutes'
       and attempt_count < 3
   )
order by created_at, id
limit 20;
