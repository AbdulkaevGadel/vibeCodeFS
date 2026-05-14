-- Targeted post-apply verification for:
-- 20260514000100_fix_kb_chunk_set_active_switch.sql
-- Read-only checks only. Do not use this file for schema changes.

-- 1. Completion RPC signature remains available.
select
    p.proname,
    pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'complete_kb_chunk_set_ingestion';

-- 2. Active invariant must still hold globally.
select
    article_id,
    count(*) as active_count
from public.knowledge_chunk_sets
where is_active = true
group by article_id
having count(*) > 1;

-- 3. Recent completed replacements: newer active set plus older inactive history.
select
    a.id as article_id,
    a.title,
    active_set.id as active_chunk_set_id,
    active_set.completed_at as active_completed_at,
    previous_set.id as previous_chunk_set_id,
    previous_set.completed_at as previous_completed_at,
    previous_set.is_active as previous_is_active
from public.knowledge_base_articles a
join public.knowledge_chunk_sets active_set
  on active_set.article_id = a.id
 and active_set.is_active = true
 and active_set.status = 'completed'
left join lateral (
    select s.id, s.completed_at, s.is_active
    from public.knowledge_chunk_sets s
    where s.article_id = a.id
      and s.id <> active_set.id
      and s.status = 'completed'
    order by s.completed_at desc nulls last, s.created_at desc, s.id desc
    limit 1
) previous_set on true
where previous_set.id is not null
order by active_set.completed_at desc nulls last, a.updated_at desc
limit 20;

-- 4. The known manually-tested article can be inspected after refresh.
select
    a.id as article_id,
    a.title,
    s.id as chunk_set_id,
    s.status,
    s.is_active,
    s.chunk_count,
    s.embedded_chunks_count,
    count(c.id) as actual_chunks,
    s.completed_at,
    s.error_message
from public.knowledge_base_articles a
join public.knowledge_chunk_sets s on s.article_id = a.id
left join public.knowledge_chunks c on c.chunk_set_id = s.id
where a.title = 'Клиент требует возврат средств'
group by
    a.id,
    a.title,
    s.id,
    s.status,
    s.is_active,
    s.chunk_count,
    s.embedded_chunks_count,
    s.completed_at,
    s.error_message
order by s.created_at desc, s.id desc;

-- 5. Historical false-positive failures may remain, but new reruns should not add more.
select
    id,
    article_id,
    status,
    last_error_type,
    error_message,
    created_at,
    updated_at
from public.knowledge_chunk_sets
where status = 'failed'
  and error_message ilike '%duplicate_chunks%'
order by updated_at desc, created_at desc
limit 20;
