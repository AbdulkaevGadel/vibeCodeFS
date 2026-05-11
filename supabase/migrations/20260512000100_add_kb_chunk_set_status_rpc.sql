-- Service-role status check for a Knowledge Base chunk set.
-- Used by the batch worker to avoid false failed logs after kb-ingestion returns not_claimed.

create or replace function public.get_kb_chunk_set_status_v1(
    p_chunk_set_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_set public.knowledge_chunk_sets;
begin
    if p_chunk_set_id is null then
        return jsonb_build_object('type', 'invalid_request');
    end if;

    select *
    into v_set
    from public.knowledge_chunk_sets
    where id = p_chunk_set_id;

    if not found then
        return jsonb_build_object('type', 'not_found');
    end if;

    return jsonb_build_object(
        'type', 'ok',
        'chunk_set_id', v_set.id,
        'article_id', v_set.article_id,
        'status', v_set.status,
        'is_active', v_set.is_active,
        'content_checksum', v_set.content_checksum,
        'ingestion_pipeline_version', v_set.ingestion_pipeline_version,
        'attempt_count', v_set.attempt_count,
        'last_error_type', v_set.last_error_type,
        'error_message', v_set.error_message,
        'completed_at', v_set.completed_at
    );
end;
$$;

alter function public.get_kb_chunk_set_status_v1(uuid) owner to postgres;

revoke all on function public.get_kb_chunk_set_status_v1(uuid)
from public, anon, authenticated;

grant execute on function public.get_kb_chunk_set_status_v1(uuid)
to service_role;

comment on function public.get_kb_chunk_set_status_v1(uuid) is
    'Service-role read RPC returning chunk-set status for batch worker post-ingestion checks.';
