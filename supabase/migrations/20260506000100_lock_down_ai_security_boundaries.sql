-- Phase 12 blocker fix: lock down AI/RAG backend-only security boundaries.
--
-- Purpose:
-- - chat_ai_runs stores backend execution internals, snapshots, retrieval metadata,
--   config snapshots, and processing ownership data.
-- - AI lifecycle and KB ingestion worker RPCs must not be executable by browser-facing roles.
--
-- This migration is incremental. Do not edit earlier applied migrations.

alter table public.chat_ai_runs enable row level security;

revoke all on table public.chat_ai_runs from anon;
revoke all on table public.chat_ai_runs from authenticated;
revoke all on table public.chat_ai_runs from public;

revoke all (
    context_snapshot,
    prompt_snapshot,
    config_snapshot,
    retrieval_chunks,
    processing_token
) on table public.chat_ai_runs from anon;

revoke all (
    context_snapshot,
    prompt_snapshot,
    config_snapshot,
    retrieval_chunks,
    processing_token
) on table public.chat_ai_runs from authenticated;

revoke all (
    context_snapshot,
    prompt_snapshot,
    config_snapshot,
    retrieval_chunks,
    processing_token
) on table public.chat_ai_runs from public;

grant select, insert, update, delete on table public.chat_ai_runs to service_role;

revoke all on function public.mark_chat_ai_run_processing(uuid, text)
from public, anon, authenticated;

grant execute on function public.mark_chat_ai_run_processing(uuid, text)
to service_role;

revoke all on function public.finish_chat_ai_run(uuid, text, text, text, text)
from public, anon, authenticated;

grant execute on function public.finish_chat_ai_run(uuid, text, text, text, text)
to service_role;

revoke all on function public.complete_kb_chunk_set_ingestion(uuid, text, text, text, jsonb)
from public, anon, authenticated;

grant execute on function public.complete_kb_chunk_set_ingestion(uuid, text, text, text, jsonb)
to service_role;

comment on table public.chat_ai_runs is
    'Backend-only execution/audit trail for AI runs. Browser-facing roles must not access this table directly.';
