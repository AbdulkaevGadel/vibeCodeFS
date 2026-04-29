-- Phase 7 security fix: lock down Knowledge Base ingestion RPC execute privileges.
-- The ingestion worker RPCs must only be callable through the service_role backend path.

revoke execute on function public.claim_kb_chunk_set_from_webhook(uuid, text, uuid)
    from public, anon, authenticated;

revoke execute on function public.claim_next_kb_chunk_set_for_ingestion(text, uuid, integer, integer, integer)
    from public, anon, authenticated;

revoke execute on function public.heartbeat_kb_chunk_set_ingestion(uuid, text)
    from public, anon, authenticated;

revoke execute on function public.complete_kb_chunk_set_ingestion(uuid, text, text, jsonb)
    from public, anon, authenticated;

revoke execute on function public.fail_kb_chunk_set_ingestion(uuid, text, text, text)
    from public, anon, authenticated;

grant execute on function public.claim_kb_chunk_set_from_webhook(uuid, text, uuid)
    to service_role;

grant execute on function public.claim_next_kb_chunk_set_for_ingestion(text, uuid, integer, integer, integer)
    to service_role;

grant execute on function public.heartbeat_kb_chunk_set_ingestion(uuid, text)
    to service_role;

grant execute on function public.complete_kb_chunk_set_ingestion(uuid, text, text, jsonb)
    to service_role;

grant execute on function public.fail_kb_chunk_set_ingestion(uuid, text, text, text)
    to service_role;
