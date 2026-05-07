-- Phase 8.4: bump Knowledge Base ingestion pipeline after retrieval-friendly chunking changes.
-- No table shape changes here. Existing kb_ingestion_v2 chunk sets become outdated
-- through the existing embedding-state helper because the expected version changes.
-- This is a behavioral rollout switch, not a chore: changing this value invalidates
-- previous embeddings for freshness checks. The migration itself must not create
-- pending chunk sets or trigger provider calls; re-ingestion must be started via
-- manual refresh, webhook, sweep, or an explicitly controlled future bulk task.

create or replace function public.get_kb_ingestion_pipeline_version_v1()
returns text
language sql
stable
set search_path = public
as $$
    select 'kb_ingestion_v3'::text;
$$;

alter function public.get_kb_ingestion_pipeline_version_v1() owner to postgres;

revoke all on function public.get_kb_ingestion_pipeline_version_v1() from public, anon, authenticated;
grant execute on function public.get_kb_ingestion_pipeline_version_v1() to service_role;

comment on function public.get_kb_ingestion_pipeline_version_v1() is
    'Returns current expected Knowledge Base ingestion pipeline version. Used to invalidate outdated embeddings when ingestion logic changes. Phase 8.4 sets version to kb_ingestion_v3.';
