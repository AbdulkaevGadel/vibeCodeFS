-- Phase 8.1 verification: manual Knowledge Base embedding refresh.
-- Read-only checks only. Do not use this file for schema changes.

-- 1. Manual embedding refresh RPCs exist.
select
    p.proname,
    pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result,
    p.prosecdef as security_definer,
    p.proconfig as function_config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
      'get_kb_article_embedding_state_v1',
      'request_kb_article_embedding_refresh_v1'
  )
order by p.proname;

-- 2. Function execute privileges.
-- Expected: authenticated_can_execute = true, anon/public = false.
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
      'get_kb_article_embedding_state_v1',
      'request_kb_article_embedding_refresh_v1'
  )
order by p.proname;

-- 3. Chunk set uniqueness guarantees used by the RPCs.
select
    indexname,
    indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'knowledge_chunk_sets'
  and indexname in (
      'knowledge_chunk_sets_one_active_per_article',
      'knowledge_chunk_sets_article_checksum_unique'
  )
order by indexname;

-- 4. Current embedding state for non-archived articles.
-- Run while authenticated in SQL editor only if auth context is available;
-- otherwise inspect this query shape and use the app runtime test.
select
    a.id as article_id,
    a.title,
    a.status as article_status,
    active_set.id as active_chunk_set_id,
    active_set.status as active_chunk_set_status,
    active_set.content_checksum as active_checksum,
    current_set.id as current_chunk_set_id,
    current_set.status as current_chunk_set_status,
    current_set.content_checksum as current_checksum,
    current_set.is_active as current_is_active
from public.knowledge_base_articles a
left join public.knowledge_chunk_sets active_set
    on active_set.article_id = a.id
   and active_set.is_active = true
left join public.knowledge_chunk_sets current_set
    on current_set.article_id = a.id
   and current_set.content_checksum = public.calculate_kb_content_checksum(a.title, a.content)
where a.status <> 'archived'::public.article_status
order by a.updated_at desc
limit 20;
