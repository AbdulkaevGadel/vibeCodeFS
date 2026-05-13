-- Fix false duplicate_chunks during KB chunk-set completion when an older
-- chunk set is still active for the same article.

create or replace function public.complete_kb_chunk_set_ingestion(
    p_chunk_set_id uuid,
    p_processing_token text,
    p_content_checksum text,
    p_ingestion_pipeline_version text,
    p_chunks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_set public.knowledge_chunk_sets;
    v_article public.knowledge_base_articles;
    v_current_checksum text;
    v_expected_pipeline_version text;
    v_chunk_count integer;
    v_inserted_count integer;
begin
    if p_chunk_set_id is null
       or p_processing_token is null
       or btrim(p_processing_token) = ''
       or p_content_checksum is null
       or p_content_checksum !~ '^[a-f0-9]{32}$'
       or p_ingestion_pipeline_version is null
       or p_ingestion_pipeline_version !~ '^kb_ingestion_v[0-9]+$'
       or p_chunks is null
       or jsonb_typeof(p_chunks) <> 'array'
       or jsonb_array_length(p_chunks) = 0 then
        return jsonb_build_object('type', 'invalid_request');
    end if;

    v_expected_pipeline_version := public.get_kb_ingestion_pipeline_version_v1();

    select *
    into v_set
    from public.knowledge_chunk_sets
    where id = p_chunk_set_id
    for update;

    if not found then
        return jsonb_build_object('type', 'not_found');
    end if;

    if v_set.status <> 'processing'
       or v_set.processing_token is distinct from p_processing_token then
        return jsonb_build_object('type', 'owner_mismatch');
    end if;

    if v_set.content_checksum is distinct from p_content_checksum then
        return jsonb_build_object('type', 'checksum_mismatch');
    end if;

    if v_set.ingestion_pipeline_version is distinct from v_expected_pipeline_version
       or p_ingestion_pipeline_version is distinct from v_expected_pipeline_version then
        update public.knowledge_chunk_sets
        set
            status = 'failed',
            is_active = false,
            processing_token = null,
            processing_heartbeat_at = null,
            last_error_type = 'pipeline_version_mismatch',
            error_message = 'PIPELINE_VERSION_MISMATCH'
        where id = v_set.id
          and status = 'processing'
          and processing_token = p_processing_token;

        return jsonb_build_object(
            'type', 'pipeline_version_mismatch',
            'chunk_set_id', v_set.id,
            'chunk_set_pipeline_version', v_set.ingestion_pipeline_version,
            'worker_pipeline_version', p_ingestion_pipeline_version,
            'expected_pipeline_version', v_expected_pipeline_version
        );
    end if;

    select *
    into v_article
    from public.knowledge_base_articles
    where id = v_set.article_id
    for update;

    if not found then
        return jsonb_build_object('type', 'article_missing');
    end if;

    v_current_checksum := public.calculate_kb_content_checksum(v_article.title, v_article.content);

    if v_current_checksum is distinct from v_set.content_checksum then
        return jsonb_build_object('type', 'stale_checksum');
    end if;

    v_chunk_count := jsonb_array_length(p_chunks);

    begin
        delete from public.knowledge_chunks
        where chunk_set_id = v_set.id;

        insert into public.knowledge_chunks (
            chunk_set_id,
            article_id,
            chunk_index,
            chunk_text,
            content_checksum,
            ingestion_pipeline_version,
            embedding,
            embedding_status,
            embedding_error
        )
        select
            v_set.id,
            v_set.article_id,
            (chunk_item ->> 'chunk_index')::integer,
            chunk_item ->> 'chunk_text',
            v_set.content_checksum,
            v_set.ingestion_pipeline_version,
            (chunk_item -> 'embedding')::text::vector(384),
            'completed',
            null
        from jsonb_array_elements(p_chunks) as chunk_item
        where jsonb_typeof(chunk_item) = 'object'
          and chunk_item ? 'chunk_index'
          and chunk_item ? 'chunk_text'
          and chunk_item ? 'embedding'
          and btrim(chunk_item ->> 'chunk_text') <> ''
          and jsonb_typeof(chunk_item -> 'embedding') = 'array'
          and jsonb_array_length(chunk_item -> 'embedding') = v_set.embedding_dimension;
    exception
        when unique_violation then
            return jsonb_build_object('type', 'duplicate_chunks');
    end;

    get diagnostics v_inserted_count = row_count;

    if v_inserted_count <> v_chunk_count then
        raise exception 'INVALID_CHUNKS_PAYLOAD' using errcode = 'P0001';
    end if;

    update public.knowledge_chunk_sets
    set is_active = false
    where article_id = v_set.article_id
      and id <> v_set.id
      and is_active = true;

    update public.knowledge_chunk_sets
    set
        is_active = true,
        status = 'completed',
        chunk_count = v_inserted_count,
        embedded_chunks_count = v_inserted_count,
        completed_at = now(),
        processing_token = null,
        processing_heartbeat_at = null,
        last_error_type = null,
        error_message = null
    where id = v_set.id;

    return jsonb_build_object(
        'type', 'completed',
        'chunk_set_id', v_set.id,
        'article_id', v_set.article_id,
        'chunk_count', v_inserted_count,
        'ingestion_pipeline_version', v_set.ingestion_pipeline_version
    );
end;
$$;

alter function public.complete_kb_chunk_set_ingestion(uuid, text, text, text, jsonb) owner to postgres;

revoke all on function public.complete_kb_chunk_set_ingestion(uuid, text, text, text, jsonb)
from public, anon, authenticated;

grant execute on function public.complete_kb_chunk_set_ingestion(uuid, text, text, text, jsonb)
to service_role;

comment on function public.complete_kb_chunk_set_ingestion(uuid, text, text, text, jsonb) is
    'Atomically inserts completed chunks and switches the active chunk set after checksum, ownership, and ingestion pipeline version checks. Chunk duplicate conflicts are reported only from the chunk insert stage.';
