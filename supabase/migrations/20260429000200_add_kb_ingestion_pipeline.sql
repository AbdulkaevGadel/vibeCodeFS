-- Phase 7: Knowledge Base ingestion execution pipeline.
-- Worker ownership, heartbeat, retry-aware claim, and atomic active switch.

alter table public.knowledge_chunk_sets
    add column if not exists processing_token text,
    add column if not exists processing_heartbeat_at timestamptz,
    add column if not exists last_error_type text,
    add column if not exists last_run_id uuid;

alter table public.knowledge_chunk_sets
    drop constraint if exists knowledge_chunk_sets_last_error_type_check,
    drop constraint if exists knowledge_chunk_sets_processing_owner_check;

alter table public.knowledge_chunk_sets
    add constraint knowledge_chunk_sets_last_error_type_check
        check (last_error_type is null or last_error_type in ('validation', 'external', 'system')),
    add constraint knowledge_chunk_sets_processing_owner_check
        check (
            status <> 'processing'
            or (
                processing_token is not null
                and btrim(processing_token) <> ''
                and processing_started_at is not null
                and processing_heartbeat_at is not null
            )
        );

create index if not exists knowledge_chunk_sets_retry_queue_idx
    on public.knowledge_chunk_sets (last_error_type, attempt_count, last_attempt_at, id)
    where status = 'failed';

create index if not exists knowledge_chunk_sets_heartbeat_idx
    on public.knowledge_chunk_sets (processing_heartbeat_at, processing_started_at, id)
    where status = 'processing';

create or replace function public.claim_kb_chunk_set_from_webhook(
    p_chunk_set_id uuid,
    p_processing_token text,
    p_ingestion_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_claimed public.knowledge_chunk_sets;
    v_article public.knowledge_base_articles;
begin
    if p_chunk_set_id is null
       or p_processing_token is null
       or btrim(p_processing_token) = ''
       or p_ingestion_run_id is null then
        return jsonb_build_object('type', 'invalid_request');
    end if;

    update public.knowledge_chunk_sets
    set
        status = 'processing',
        attempt_count = attempt_count + 1,
        last_attempt_at = now(),
        processing_started_at = now(),
        processing_heartbeat_at = now(),
        processing_token = p_processing_token,
        last_run_id = p_ingestion_run_id,
        last_error_type = null,
        error_message = null
    where id = p_chunk_set_id
      and status = 'pending'
    returning * into v_claimed;

    if not found then
        return jsonb_build_object('type', 'not_claimed');
    end if;

    delete from public.knowledge_chunks
    where chunk_set_id = v_claimed.id;

    select *
    into v_article
    from public.knowledge_base_articles
    where id = v_claimed.article_id;

    if not found then
        return jsonb_build_object(
            'type', 'claimed_article_missing',
            'chunk_set_id', v_claimed.id,
            'processing_token', p_processing_token
        );
    end if;

    return jsonb_build_object(
        'type', 'claimed',
        'chunk_set_id', v_claimed.id,
        'article_id', v_claimed.article_id,
        'content_checksum', v_claimed.content_checksum,
        'embedding_provider', v_claimed.embedding_provider,
        'embedding_model', v_claimed.embedding_model,
        'embedding_dimension', v_claimed.embedding_dimension,
        'attempt_count', v_claimed.attempt_count,
        'processing_token', p_processing_token,
        'ingestion_run_id', p_ingestion_run_id,
        'article', jsonb_build_object(
            'id', v_article.id,
            'title', v_article.title,
            'content', v_article.content,
            'status', v_article.status
        )
    );
end;
$$;

create or replace function public.claim_next_kb_chunk_set_for_ingestion(
    p_processing_token text,
    p_ingestion_run_id uuid,
    p_stale_after_seconds integer default 300,
    p_retry_after_seconds integer default 60,
    p_max_attempts integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_chunk_set_id uuid;
    v_terminal_stale_id uuid;
    v_claimed public.knowledge_chunk_sets;
    v_article public.knowledge_base_articles;
    v_stale_after interval;
    v_retry_after interval;
begin
    if p_processing_token is null
       or btrim(p_processing_token) = ''
       or p_ingestion_run_id is null
       or p_stale_after_seconds is null
       or p_stale_after_seconds <= 0
       or p_retry_after_seconds is null
       or p_retry_after_seconds < 0
       or p_max_attempts is null
       or p_max_attempts <= 0 then
        return jsonb_build_object('type', 'invalid_request');
    end if;

    v_stale_after := make_interval(secs => p_stale_after_seconds);
    v_retry_after := make_interval(secs => p_retry_after_seconds);

    select id
    into v_terminal_stale_id
    from public.knowledge_chunk_sets
    where status = 'processing'
      and coalesce(processing_heartbeat_at, processing_started_at) <= now() - v_stale_after
      and attempt_count >= p_max_attempts
    order by created_at, id
    for update skip locked
    limit 1;

    if v_terminal_stale_id is not null then
        update public.knowledge_chunk_sets
        set
            status = 'failed',
            is_active = false,
            processing_token = null,
            processing_heartbeat_at = null,
            last_error_type = 'system',
            error_message = 'STALE_PROCESSING_MAX_ATTEMPTS_REACHED'
        where id = v_terminal_stale_id;

        return jsonb_build_object(
            'type', 'stale_max_attempts_failed',
            'chunk_set_id', v_terminal_stale_id
        );
    end if;

    select id
    into v_chunk_set_id
    from public.knowledge_chunk_sets
    where
        status = 'pending'
        or (
            status = 'failed'
            and last_error_type in ('external', 'system')
            and attempt_count < p_max_attempts
            and (
                last_attempt_at is null
                or last_attempt_at <= now() - v_retry_after
            )
        )
        or (
            status = 'processing'
            and coalesce(processing_heartbeat_at, processing_started_at) <= now() - v_stale_after
            and attempt_count < p_max_attempts
        )
    order by
        case status
            when 'pending' then 0
            when 'failed' then 1
            else 2
        end,
        created_at,
        id
    for update skip locked
    limit 1;

    if v_chunk_set_id is null then
        return jsonb_build_object('type', 'empty');
    end if;

    update public.knowledge_chunk_sets
    set
        status = 'processing',
        attempt_count = attempt_count + 1,
        last_attempt_at = now(),
        processing_started_at = now(),
        processing_heartbeat_at = now(),
        processing_token = p_processing_token,
        last_run_id = p_ingestion_run_id,
        last_error_type = null,
        error_message = null
    where id = v_chunk_set_id
      and (
          status = 'pending'
          or (
              status = 'failed'
              and last_error_type in ('external', 'system')
              and attempt_count < p_max_attempts
              and (
                  last_attempt_at is null
                  or last_attempt_at <= now() - v_retry_after
              )
          )
          or (
              status = 'processing'
              and coalesce(processing_heartbeat_at, processing_started_at) <= now() - v_stale_after
              and attempt_count < p_max_attempts
          )
      )
    returning * into v_claimed;

    if not found then
        return jsonb_build_object('type', 'not_claimed');
    end if;

    delete from public.knowledge_chunks
    where chunk_set_id = v_claimed.id;

    select *
    into v_article
    from public.knowledge_base_articles
    where id = v_claimed.article_id;

    if not found then
        return jsonb_build_object(
            'type', 'claimed_article_missing',
            'chunk_set_id', v_claimed.id,
            'processing_token', p_processing_token
        );
    end if;

    return jsonb_build_object(
        'type', 'claimed',
        'chunk_set_id', v_claimed.id,
        'article_id', v_claimed.article_id,
        'content_checksum', v_claimed.content_checksum,
        'embedding_provider', v_claimed.embedding_provider,
        'embedding_model', v_claimed.embedding_model,
        'embedding_dimension', v_claimed.embedding_dimension,
        'attempt_count', v_claimed.attempt_count,
        'processing_token', p_processing_token,
        'ingestion_run_id', p_ingestion_run_id,
        'article', jsonb_build_object(
            'id', v_article.id,
            'title', v_article.title,
            'content', v_article.content,
            'status', v_article.status
        )
    );
end;
$$;

create or replace function public.heartbeat_kb_chunk_set_ingestion(
    p_chunk_set_id uuid,
    p_processing_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_chunk_set_id is null
       or p_processing_token is null
       or btrim(p_processing_token) = '' then
        return jsonb_build_object('type', 'invalid_request');
    end if;

    update public.knowledge_chunk_sets
    set processing_heartbeat_at = now()
    where id = p_chunk_set_id
      and status = 'processing'
      and processing_token = p_processing_token
      and processing_started_at > now() - interval '30 minutes';

    if not found then
        return jsonb_build_object('type', 'owner_mismatch');
    end if;

    return jsonb_build_object('type', 'heartbeat');
end;
$$;

create or replace function public.complete_kb_chunk_set_ingestion(
    p_chunk_set_id uuid,
    p_processing_token text,
    p_content_checksum text,
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
    v_chunk_count integer;
    v_inserted_count integer;
begin
    if p_chunk_set_id is null
       or p_processing_token is null
       or btrim(p_processing_token) = ''
       or p_content_checksum is null
       or p_content_checksum !~ '^[a-f0-9]{32}$'
       or p_chunks is null
       or jsonb_typeof(p_chunks) <> 'array'
       or jsonb_array_length(p_chunks) = 0 then
        return jsonb_build_object('type', 'invalid_request');
    end if;

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

    delete from public.knowledge_chunks
    where chunk_set_id = v_set.id;

    insert into public.knowledge_chunks (
        chunk_set_id,
        article_id,
        chunk_index,
        chunk_text,
        content_checksum,
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

    get diagnostics v_inserted_count = row_count;

    if v_inserted_count <> v_chunk_count then
        raise exception 'INVALID_CHUNKS_PAYLOAD' using errcode = 'P0001';
    end if;

    update public.knowledge_chunk_sets
    set
        is_active = false
    where article_id = v_set.article_id
      and id <> v_set.id
      and is_active = true;

    update public.knowledge_chunk_sets
    set
        status = 'completed',
        is_active = true,
        chunk_count = v_inserted_count,
        embedded_chunks_count = v_inserted_count,
        completed_at = now(),
        processing_token = null,
        processing_heartbeat_at = null,
        last_error_type = null,
        error_message = null
    where id = v_set.id
      and status = 'processing'
      and processing_token = p_processing_token;

    return jsonb_build_object(
        'type', 'completed',
        'chunk_set_id', v_set.id,
        'article_id', v_set.article_id,
        'chunk_count', v_inserted_count
    );
exception
    when unique_violation then
        return jsonb_build_object('type', 'duplicate_chunks');
end;
$$;

create or replace function public.fail_kb_chunk_set_ingestion(
    p_chunk_set_id uuid,
    p_processing_token text,
    p_error_type text,
    p_error_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_chunk_set_id is null
       or p_processing_token is null
       or btrim(p_processing_token) = ''
       or p_error_type not in ('validation', 'external', 'system') then
        return jsonb_build_object('type', 'invalid_request');
    end if;

    update public.knowledge_chunk_sets
    set
        status = 'failed',
        processing_token = null,
        processing_heartbeat_at = null,
        last_error_type = p_error_type,
        error_message = left(coalesce(p_error_message, 'INGESTION_FAILED'), 1000)
    where id = p_chunk_set_id
      and status = 'processing'
      and processing_token = p_processing_token;

    if not found then
        return jsonb_build_object('type', 'owner_mismatch');
    end if;

    return jsonb_build_object('type', 'failed', 'chunk_set_id', p_chunk_set_id);
end;
$$;

alter function public.claim_kb_chunk_set_from_webhook(uuid, text, uuid) owner to postgres;
alter function public.claim_next_kb_chunk_set_for_ingestion(text, uuid, integer, integer, integer) owner to postgres;
alter function public.heartbeat_kb_chunk_set_ingestion(uuid, text) owner to postgres;
alter function public.complete_kb_chunk_set_ingestion(uuid, text, text, jsonb) owner to postgres;
alter function public.fail_kb_chunk_set_ingestion(uuid, text, text, text) owner to postgres;

revoke all on function public.claim_kb_chunk_set_from_webhook(uuid, text, uuid) from public;
revoke all on function public.claim_next_kb_chunk_set_for_ingestion(text, uuid, integer, integer, integer) from public;
revoke all on function public.heartbeat_kb_chunk_set_ingestion(uuid, text) from public;
revoke all on function public.complete_kb_chunk_set_ingestion(uuid, text, text, jsonb) from public;
revoke all on function public.fail_kb_chunk_set_ingestion(uuid, text, text, text) from public;

grant execute on function public.claim_kb_chunk_set_from_webhook(uuid, text, uuid) to service_role;
grant execute on function public.claim_next_kb_chunk_set_for_ingestion(text, uuid, integer, integer, integer) to service_role;
grant execute on function public.heartbeat_kb_chunk_set_ingestion(uuid, text) to service_role;
grant execute on function public.complete_kb_chunk_set_ingestion(uuid, text, text, jsonb) to service_role;
grant execute on function public.fail_kb_chunk_set_ingestion(uuid, text, text, text) to service_role;

comment on column public.knowledge_chunk_sets.processing_token is
    'Current ingestion worker ownership token. Required while status is processing.';

comment on column public.knowledge_chunk_sets.processing_heartbeat_at is
    'Updated by the owning ingestion worker to prevent live long-running jobs from being reclaimed as stale.';

comment on column public.knowledge_chunk_sets.last_error_type is
    'Safe retry classification for the latest ingestion failure: validation, external, or system.';

comment on column public.knowledge_chunk_sets.last_run_id is
    'Latest ingestion runtime trace id used for logs and support debugging.';

comment on function public.claim_kb_chunk_set_from_webhook(uuid, text, uuid) is
    'Claims a pending Knowledge Base chunk set from a database webhook trigger.';

comment on function public.claim_next_kb_chunk_set_for_ingestion(text, uuid, integer, integer, integer) is
    'Claims the next pending, retryable failed, or stale processing Knowledge Base chunk set for scheduled sweep.';

comment on function public.heartbeat_kb_chunk_set_ingestion(uuid, text) is
    'Refreshes ingestion heartbeat for the current owning worker token.';

comment on function public.complete_kb_chunk_set_ingestion(uuid, text, text, jsonb) is
    'Atomically inserts completed chunks and switches the active chunk set after checksum and ownership checks.';

comment on function public.fail_kb_chunk_set_ingestion(uuid, text, text, text) is
    'Marks the owned processing chunk set as failed while preserving the previous active set.';
