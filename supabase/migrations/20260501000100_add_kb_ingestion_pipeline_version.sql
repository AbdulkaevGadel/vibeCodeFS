-- Phase 8.3: version Knowledge Base ingestion pipeline freshness.
-- Existing chunk sets are backfilled as kb_ingestion_v1; current expected pipeline is kb_ingestion_v2.

alter table public.knowledge_chunk_sets
    add column if not exists ingestion_pipeline_version text;

update public.knowledge_chunk_sets
set ingestion_pipeline_version = 'kb_ingestion_v1'
where ingestion_pipeline_version is null;

alter table public.knowledge_chunk_sets
    alter column ingestion_pipeline_version set not null;

alter table public.knowledge_chunks
    add column if not exists ingestion_pipeline_version text;

update public.knowledge_chunks c
set ingestion_pipeline_version = coalesce(s.ingestion_pipeline_version, 'kb_ingestion_v1')
from public.knowledge_chunk_sets s
where s.id = c.chunk_set_id
  and c.ingestion_pipeline_version is null;

update public.knowledge_chunks
set ingestion_pipeline_version = 'kb_ingestion_v1'
where ingestion_pipeline_version is null;

alter table public.knowledge_chunks
    alter column ingestion_pipeline_version set not null;

alter table public.knowledge_chunk_sets
    drop constraint if exists knowledge_chunk_sets_article_checksum_unique,
    drop constraint if exists knowledge_chunk_sets_pipeline_version_format_check,
    drop constraint if exists knowledge_chunk_sets_last_error_type_check;

alter table public.knowledge_chunk_sets
    add constraint knowledge_chunk_sets_pipeline_version_format_check
        check (ingestion_pipeline_version ~ '^kb_ingestion_v[0-9]+$'),
    add constraint knowledge_chunk_sets_article_checksum_pipeline_unique
        unique (article_id, content_checksum, ingestion_pipeline_version),
    add constraint knowledge_chunk_sets_last_error_type_check
        check (last_error_type is null or last_error_type in ('validation', 'external', 'system', 'pipeline_version_mismatch'));

alter table public.knowledge_chunks
    drop constraint if exists knowledge_chunks_pipeline_version_format_check;

alter table public.knowledge_chunks
    add constraint knowledge_chunks_pipeline_version_format_check
        check (ingestion_pipeline_version ~ '^kb_ingestion_v[0-9]+$');

create index if not exists knowledge_chunk_sets_pipeline_queue_idx
    on public.knowledge_chunk_sets (ingestion_pipeline_version, status, created_at, id)
    where status in ('pending', 'failed', 'processing');

create unique index if not exists knowledge_chunk_sets_one_processing_per_article
    on public.knowledge_chunk_sets (article_id)
    where status = 'processing';

create index if not exists knowledge_chunks_pipeline_debug_idx
    on public.knowledge_chunks (ingestion_pipeline_version, article_id, chunk_set_id);

create or replace function public.get_kb_ingestion_pipeline_version_v1()
returns text
language sql
stable
set search_path = public
as $$
    select 'kb_ingestion_v2'::text;
$$;

create or replace function public.ensure_kb_pending_chunk_set(
    p_article_id uuid,
    p_title text,
    p_content text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_checksum text;
    v_pipeline_version text;
    v_chunk_set_id uuid;
begin
    v_checksum := public.calculate_kb_content_checksum(p_title, p_content);
    v_pipeline_version := public.get_kb_ingestion_pipeline_version_v1();

    loop
        insert into public.knowledge_chunk_sets (
            article_id,
            content_checksum,
            ingestion_pipeline_version,
            embedding_provider,
            embedding_model,
            embedding_dimension,
            status,
            is_active
        ) values (
            p_article_id,
            v_checksum,
            v_pipeline_version,
            'huggingface',
            'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
            384,
            'pending',
            false
        )
        on conflict (article_id, content_checksum, ingestion_pipeline_version) do nothing
        returning id into v_chunk_set_id;

        if v_chunk_set_id is not null then
            return v_chunk_set_id;
        end if;

        select id into v_chunk_set_id
        from public.knowledge_chunk_sets
        where article_id = p_article_id
          and content_checksum = v_checksum
          and ingestion_pipeline_version = v_pipeline_version;

        if v_chunk_set_id is not null then
            return v_chunk_set_id;
        end if;
    end loop;
end;
$$;

create or replace function public.update_kb_article_v1(
    p_id uuid,
    p_title text default null,
    p_content text default null,
    p_slug text default null,
    p_status public.article_status default null,
    p_version int default null
)
returns public.knowledge_base_articles
language plpgsql
security definer
set search_path = public
as $$
declare
    v_manager_id uuid;
    v_final_slug text;
    v_result public.knowledge_base_articles;
    v_existing public.knowledge_base_articles;
    v_is_admin boolean;
    v_change_type public.kb_change_type := 'update';
    v_previous_checksum text;
    v_next_checksum text;
    v_pipeline_version text;
begin
    v_manager_id := public.get_current_manager_id_v1();
    v_is_admin := public.is_admin_v1();
    v_pipeline_version := public.get_kb_ingestion_pipeline_version_v1();

    select *
    into v_existing
    from public.knowledge_base_articles
    where id = p_id;

    if not found then
        raise exception 'ARTICLE_NOT_FOUND' using errcode = 'P0002';
    end if;

    v_previous_checksum := public.calculate_kb_content_checksum(v_existing.title, v_existing.content);

    if p_slug is not null then
        for i in 0..10 loop
            v_final_slug := lower(trim(p_slug)) || case when i = 0 then '' else '-' || i end;
            if not exists (select 1 from public.knowledge_base_articles where slug = v_final_slug and id != p_id) then
                exit;
            end if;
        end loop;
    end if;

    update public.knowledge_base_articles
    set
        title = coalesce(p_title, title),
        content = coalesce(p_content, content),
        content_plain = coalesce(p_content, content),
        content_tokens = coalesce(length(coalesce(p_content, content)), 0) / 4,
        slug = coalesce(v_final_slug, slug),
        status = coalesce(p_status, status),
        updated_by_id = v_manager_id,
        version = version + 1,
        archived_at = case
            when coalesce(p_status, status) = 'archived' and archived_at is null then now()
            when coalesce(p_status, status) != 'archived' then null
            else archived_at
        end,
        archived_by_id = case
            when coalesce(p_status, status) = 'archived' and archived_by_id is null then v_manager_id
            when coalesce(p_status, status) != 'archived' then null
            else archived_by_id
        end,
        updated_at = now()
    where id = p_id
      and (p_version is null or version = p_version)
      and (created_by_id = v_manager_id or v_is_admin)
    returning * into v_result;

    if not found then
        raise exception 'VERSION_CONFLICT_OR_FORBIDDEN' using errcode = 'P0001';
    end if;

    if p_status is not null and p_title is null and p_content is null then
        if p_status = 'archived' then
            v_change_type := 'archive';
        elsif p_status = 'published' then
            v_change_type := 'publish';
        else
            v_change_type := 'update';
        end if;
    end if;

    insert into public.knowledge_base_history (
        article_id,
        title,
        content,
        version,
        status,
        changed_by_id,
        change_type
    ) values (
        v_result.id,
        v_result.title,
        v_result.content,
        v_result.version,
        v_result.status,
        v_manager_id,
        v_change_type
    );

    v_next_checksum := public.calculate_kb_content_checksum(v_result.title, v_result.content);

    if v_result.status <> 'archived'::public.article_status
       and (
           v_next_checksum is distinct from v_previous_checksum
           or not exists (
               select 1
               from public.knowledge_chunk_sets
               where article_id = v_result.id
                 and content_checksum = v_next_checksum
                 and ingestion_pipeline_version = v_pipeline_version
           )
       ) then
        perform public.ensure_kb_pending_chunk_set(v_result.id, v_result.title, v_result.content);
    end if;

    return v_result;
end;
$$;

create or replace function public.get_kb_article_embedding_state_v1(
    p_article_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_auth_uid uuid;
    v_manager_id uuid;
    v_article_id uuid;
    v_title text;
    v_content text;
    v_status public.article_status;
    v_current_checksum text;
    v_pipeline_version text;
    v_current_count integer;
    v_active_count integer;
    v_current_id uuid;
    v_current_status text;
    v_current_is_active boolean;
    v_current_error_message text;
    v_active_id uuid;
    v_embedding_status text;
    v_chunk_set_id uuid;
    v_error_message text;
begin
    if p_article_id is null then
        return jsonb_build_object(
            'type', 'invalid_request',
            'embedding_status', 'unavailable',
            'chunk_set_id', null,
            'error_message', 'ARTICLE_ID_REQUIRED'
        );
    end if;

    v_auth_uid := auth.uid();

    if v_auth_uid is null then
        return jsonb_build_object(
            'type', 'forbidden',
            'embedding_status', 'unavailable',
            'chunk_set_id', null,
            'error_message', null
        );
    end if;

    v_manager_id := public.get_current_manager_id_safe_v1();

    if v_manager_id is null then
        return jsonb_build_object(
            'type', 'forbidden',
            'embedding_status', 'unavailable',
            'chunk_set_id', null,
            'error_message', null
        );
    end if;

    select id, title, content, status
    into v_article_id, v_title, v_content, v_status
    from public.knowledge_base_articles
    where id = p_article_id;

    if not found then
        return jsonb_build_object(
            'type', 'not_found',
            'embedding_status', 'unavailable',
            'chunk_set_id', null,
            'error_message', null
        );
    end if;

    if v_status = 'archived'::public.article_status then
        return jsonb_build_object(
            'type', 'ok',
            'embedding_status', 'unavailable',
            'chunk_set_id', null,
            'error_message', null
        );
    end if;

    v_current_checksum := public.calculate_kb_content_checksum(v_title, v_content);
    v_pipeline_version := public.get_kb_ingestion_pipeline_version_v1();

    select count(*)
    into v_current_count
    from public.knowledge_chunk_sets
    where article_id = v_article_id
      and content_checksum = v_current_checksum
      and ingestion_pipeline_version = v_pipeline_version;

    select count(*)
    into v_active_count
    from public.knowledge_chunk_sets
    where article_id = v_article_id
      and is_active = true;

    if v_current_count > 1 or v_active_count > 1 then
        return jsonb_build_object(
            'type', 'unavailable',
            'embedding_status', 'unavailable',
            'chunk_set_id', null,
            'error_message', 'INCONSISTENT_CHUNK_SETS'
        );
    end if;

    select id, status, is_active, error_message
    into v_current_id, v_current_status, v_current_is_active, v_current_error_message
    from public.knowledge_chunk_sets
    where article_id = v_article_id
      and content_checksum = v_current_checksum
      and ingestion_pipeline_version = v_pipeline_version;

    select id
    into v_active_id
    from public.knowledge_chunk_sets
    where article_id = v_article_id
      and is_active = true;

    if v_active_id is not null and v_current_id is null then
        v_embedding_status := 'outdated';
        v_chunk_set_id := v_active_id;
        v_error_message := null;
    elsif v_current_id is null then
        v_embedding_status := 'outdated';
        v_chunk_set_id := null;
        v_error_message := null;
    elsif v_current_status in ('pending', 'processing') then
        v_embedding_status := 'updating';
        v_chunk_set_id := v_current_id;
        v_error_message := null;
    elsif v_current_status = 'failed' then
        v_embedding_status := 'failed';
        v_chunk_set_id := v_current_id;
        v_error_message := v_current_error_message;
    elsif v_current_status = 'completed' and v_current_is_active = true then
        v_embedding_status := 'actual';
        v_chunk_set_id := v_current_id;
        v_error_message := null;
    elsif v_current_status = 'completed' and v_current_is_active = false then
        v_embedding_status := 'outdated';
        v_chunk_set_id := v_current_id;
        v_error_message := null;
    else
        v_embedding_status := 'unavailable';
        v_chunk_set_id := v_current_id;
        v_error_message := 'UNKNOWN_CHUNK_SET_STATUS';
    end if;

    return jsonb_build_object(
        'type', 'ok',
        'embedding_status', v_embedding_status,
        'chunk_set_id', v_chunk_set_id,
        'error_message', v_error_message,
        'ingestion_pipeline_version', v_pipeline_version
    );
end;
$$;

create or replace function public.request_kb_article_embedding_refresh_v1(
    p_article_id uuid,
    p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_auth_uid uuid;
    v_manager_id uuid;
    v_manager_role text;
    v_article_id uuid;
    v_title text;
    v_content text;
    v_status public.article_status;
    v_version integer;
    v_current_checksum text;
    v_pipeline_version text;
    v_current_count integer;
    v_active_count integer;
    v_current_processing_count integer;
    v_article_processing_count integer;
    v_current_id uuid;
    v_current_status text;
    v_current_is_active boolean;
    v_locked_chunk_set_id uuid;
    v_chunk_set_id uuid;
    v_verified_checksum text;
    v_verified_status text;
    v_verified_pipeline_version text;
begin
    if p_article_id is null or p_expected_version is null then
        return jsonb_build_object(
            'type', 'invalid_request',
            'article_id', p_article_id,
            'chunk_set_id', null,
            'embedding_status', 'unavailable',
            'error_message', 'ARTICLE_ID_AND_EXPECTED_VERSION_REQUIRED'
        );
    end if;

    v_auth_uid := auth.uid();

    if v_auth_uid is null then
        return jsonb_build_object(
            'type', 'forbidden',
            'article_id', p_article_id,
            'chunk_set_id', null,
            'embedding_status', 'unavailable',
            'error_message', null
        );
    end if;

    v_manager_id := public.get_current_manager_id_safe_v1();

    if v_manager_id is null then
        return jsonb_build_object(
            'type', 'forbidden',
            'article_id', p_article_id,
            'chunk_set_id', null,
            'embedding_status', 'unavailable',
            'error_message', null
        );
    end if;

    select role
    into v_manager_role
    from public.managers
    where id = v_manager_id;

    if v_manager_role is null or v_manager_role not in ('admin', 'supervisor') then
        return jsonb_build_object(
            'type', 'forbidden',
            'article_id', p_article_id,
            'chunk_set_id', null,
            'embedding_status', 'unavailable',
            'error_message', null
        );
    end if;

    select id, title, content, status, version
    into v_article_id, v_title, v_content, v_status, v_version
    from public.knowledge_base_articles
    where id = p_article_id
    for update;

    if not found then
        return jsonb_build_object(
            'type', 'not_found',
            'article_id', p_article_id,
            'chunk_set_id', null,
            'embedding_status', 'unavailable',
            'error_message', null
        );
    end if;

    for v_locked_chunk_set_id in
        select id
        from public.knowledge_chunk_sets
        where article_id = v_article_id
        order by id asc
        for update
    loop
    end loop;

    if v_version is distinct from p_expected_version then
        return jsonb_build_object(
            'type', 'version_conflict',
            'article_id', v_article_id,
            'chunk_set_id', null,
            'embedding_status', 'unavailable',
            'error_message', null
        );
    end if;

    if v_status = 'archived'::public.article_status then
        return jsonb_build_object(
            'type', 'unavailable',
            'article_id', v_article_id,
            'chunk_set_id', null,
            'embedding_status', 'unavailable',
            'error_message', null
        );
    end if;

    v_current_checksum := public.calculate_kb_content_checksum(v_title, v_content);
    v_pipeline_version := public.get_kb_ingestion_pipeline_version_v1();

    select
        count(*) filter (
            where content_checksum = v_current_checksum
              and ingestion_pipeline_version = v_pipeline_version
        ),
        count(*) filter (where is_active = true),
        count(*) filter (
            where content_checksum = v_current_checksum
              and ingestion_pipeline_version = v_pipeline_version
              and status in ('pending', 'processing')
        ),
        count(*) filter (where status = 'processing')
    into
        v_current_count,
        v_active_count,
        v_current_processing_count,
        v_article_processing_count
    from public.knowledge_chunk_sets
    where article_id = v_article_id;

    if v_current_count > 1 or v_active_count > 1 or v_article_processing_count > 1 then
        return jsonb_build_object(
            'type', 'unavailable',
            'article_id', v_article_id,
            'chunk_set_id', null,
            'embedding_status', 'unavailable',
            'error_message', 'INCONSISTENT_CHUNK_SETS'
        );
    end if;

    select id, status, is_active
    into v_current_id, v_current_status, v_current_is_active
    from public.knowledge_chunk_sets
    where article_id = v_article_id
      and content_checksum = v_current_checksum
      and ingestion_pipeline_version = v_pipeline_version;

    if v_current_id is not null and v_current_status in ('pending', 'processing') then
        return jsonb_build_object(
            'type', 'already_updating',
            'article_id', v_article_id,
            'chunk_set_id', v_current_id,
            'embedding_status', 'updating',
            'error_message', null
        );
    end if;

    if v_current_id is not null and v_current_status = 'completed' then
        if v_current_is_active is not true then
            update public.knowledge_chunk_sets
            set is_active = (id = v_current_id)
            where article_id = v_article_id
              and (id = v_current_id or is_active = true);
        end if;

        return jsonb_build_object(
            'type', 'already_actual',
            'article_id', v_article_id,
            'chunk_set_id', v_current_id,
            'embedding_status', 'actual',
            'error_message', null
        );
    end if;

    if v_current_id is not null and v_current_status = 'failed' then
        update public.knowledge_chunk_sets
        set
            status = 'pending',
            is_active = false,
            chunk_count = 0,
            embedded_chunks_count = 0,
            attempt_count = 0,
            last_attempt_at = null,
            processing_started_at = null,
            completed_at = null,
            error_message = null,
            processing_token = null,
            processing_heartbeat_at = null,
            last_error_type = null,
            last_run_id = null
        where id = v_current_id
          and article_id = v_article_id
          and content_checksum = v_current_checksum
          and ingestion_pipeline_version = v_pipeline_version
          and status = 'failed'
        returning id into v_chunk_set_id;

        if v_chunk_set_id is null then
            return jsonb_build_object(
                'type', 'unavailable',
                'article_id', v_article_id,
                'chunk_set_id', v_current_id,
                'embedding_status', 'unavailable',
                'error_message', 'FAILED_RETRY_UPDATE_LOST'
            );
        end if;

        return jsonb_build_object(
            'type', 'retry_queued',
            'article_id', v_article_id,
            'chunk_set_id', v_chunk_set_id,
            'embedding_status', 'updating',
            'error_message', null
        );
    end if;

    if v_current_id is not null then
        return jsonb_build_object(
            'type', 'unavailable',
            'article_id', v_article_id,
            'chunk_set_id', v_current_id,
            'embedding_status', 'unavailable',
            'error_message', 'UNKNOWN_CHUNK_SET_STATUS'
        );
    end if;

    v_chunk_set_id := public.ensure_kb_pending_chunk_set(v_article_id, v_title, v_content);

    select
        count(*) filter (
            where content_checksum = v_current_checksum
              and ingestion_pipeline_version = v_pipeline_version
        ),
        count(*) filter (
            where content_checksum = v_current_checksum
              and ingestion_pipeline_version = v_pipeline_version
              and status in ('pending', 'processing')
        )
    into v_current_count, v_current_processing_count
    from public.knowledge_chunk_sets
    where article_id = v_article_id;

    select content_checksum, status, ingestion_pipeline_version
    into v_verified_checksum, v_verified_status, v_verified_pipeline_version
    from public.knowledge_chunk_sets
    where id = v_chunk_set_id
      and article_id = v_article_id
    for update;

    if v_chunk_set_id is null
       or v_current_count <> 1
       or v_current_processing_count <> 1
       or v_verified_checksum is distinct from v_current_checksum
       or v_verified_pipeline_version is distinct from v_pipeline_version
       or v_verified_status <> 'pending' then
        return jsonb_build_object(
            'type', 'unavailable',
            'article_id', v_article_id,
            'chunk_set_id', v_chunk_set_id,
            'embedding_status', 'unavailable',
            'error_message', 'PENDING_CHUNK_SET_VERIFICATION_FAILED'
        );
    end if;

    return jsonb_build_object(
        'type', 'queued',
        'article_id', v_article_id,
        'chunk_set_id', v_chunk_set_id,
        'embedding_status', 'updating',
        'error_message', null
    );
end;
$$;

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
    v_pipeline_version text;
begin
    if p_chunk_set_id is null
       or p_processing_token is null
       or btrim(p_processing_token) = ''
       or p_ingestion_run_id is null then
        return jsonb_build_object('type', 'invalid_request');
    end if;

    v_pipeline_version := public.get_kb_ingestion_pipeline_version_v1();

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
      and ingestion_pipeline_version = v_pipeline_version
      and not exists (
          select 1
          from public.knowledge_chunk_sets processing_set
          where processing_set.article_id = knowledge_chunk_sets.article_id
            and processing_set.status = 'processing'
            and processing_set.id <> knowledge_chunk_sets.id
      )
    returning * into v_claimed;

    if not found then
        return jsonb_build_object('type', 'not_claimed');
    end if;

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
        'ingestion_pipeline_version', v_claimed.ingestion_pipeline_version,
        'expected_ingestion_pipeline_version', v_pipeline_version,
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
exception
    when unique_violation then
        return jsonb_build_object('type', 'not_claimed');
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
    v_pipeline_version text;
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
    v_pipeline_version := public.get_kb_ingestion_pipeline_version_v1();

    select id
    into v_terminal_stale_id
    from public.knowledge_chunk_sets
    where status = 'processing'
      and ingestion_pipeline_version = v_pipeline_version
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
    from public.knowledge_chunk_sets candidate
    where candidate.ingestion_pipeline_version = v_pipeline_version
      and not exists (
          select 1
          from public.knowledge_chunk_sets processing_set
          where processing_set.article_id = candidate.article_id
            and processing_set.status = 'processing'
            and processing_set.id <> candidate.id
      )
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
      and ingestion_pipeline_version = v_pipeline_version
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
        'ingestion_pipeline_version', v_claimed.ingestion_pipeline_version,
        'expected_ingestion_pipeline_version', v_pipeline_version,
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
exception
    when unique_violation then
        return jsonb_build_object('type', 'not_claimed');
end;
$$;

drop function if exists public.complete_kb_chunk_set_ingestion(uuid, text, text, jsonb);

create function public.complete_kb_chunk_set_ingestion(
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

    get diagnostics v_inserted_count = row_count;

    if v_inserted_count <> v_chunk_count then
        raise exception 'INVALID_CHUNKS_PAYLOAD' using errcode = 'P0001';
    end if;

    update public.knowledge_chunk_sets
    set
        is_active = (id = v_set.id),
        status = case when id = v_set.id then 'completed' else status end,
        chunk_count = case when id = v_set.id then v_inserted_count else chunk_count end,
        embedded_chunks_count = case when id = v_set.id then v_inserted_count else embedded_chunks_count end,
        completed_at = case when id = v_set.id then now() else completed_at end,
        processing_token = case when id = v_set.id then null else processing_token end,
        processing_heartbeat_at = case when id = v_set.id then null else processing_heartbeat_at end,
        last_error_type = case when id = v_set.id then null else last_error_type end,
        error_message = case when id = v_set.id then null else error_message end
    where article_id = v_set.article_id;

    return jsonb_build_object(
        'type', 'completed',
        'chunk_set_id', v_set.id,
        'article_id', v_set.article_id,
        'chunk_count', v_inserted_count,
        'ingestion_pipeline_version', v_set.ingestion_pipeline_version
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
       or p_error_type not in ('validation', 'external', 'system', 'pipeline_version_mismatch') then
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

alter function public.get_kb_ingestion_pipeline_version_v1() owner to postgres;
alter function public.ensure_kb_pending_chunk_set(uuid, text, text) owner to postgres;
alter function public.update_kb_article_v1(uuid, text, text, text, public.article_status, int) owner to postgres;
alter function public.get_kb_article_embedding_state_v1(uuid) owner to postgres;
alter function public.request_kb_article_embedding_refresh_v1(uuid, integer) owner to postgres;
alter function public.claim_kb_chunk_set_from_webhook(uuid, text, uuid) owner to postgres;
alter function public.claim_next_kb_chunk_set_for_ingestion(text, uuid, integer, integer, integer) owner to postgres;
alter function public.complete_kb_chunk_set_ingestion(uuid, text, text, text, jsonb) owner to postgres;
alter function public.fail_kb_chunk_set_ingestion(uuid, text, text, text) owner to postgres;

revoke all on function public.get_kb_ingestion_pipeline_version_v1() from public, anon, authenticated;
revoke all on function public.ensure_kb_pending_chunk_set(uuid, text, text) from public;
revoke all on function public.update_kb_article_v1(uuid, text, text, text, public.article_status, int) from public;
revoke all on function public.get_kb_article_embedding_state_v1(uuid) from public, anon, authenticated;
revoke all on function public.request_kb_article_embedding_refresh_v1(uuid, integer) from public, anon, authenticated;
revoke all on function public.claim_kb_chunk_set_from_webhook(uuid, text, uuid) from public;
revoke all on function public.claim_next_kb_chunk_set_for_ingestion(text, uuid, integer, integer, integer) from public;
revoke all on function public.complete_kb_chunk_set_ingestion(uuid, text, text, text, jsonb) from public;
revoke all on function public.fail_kb_chunk_set_ingestion(uuid, text, text, text) from public;

grant execute on function public.get_kb_ingestion_pipeline_version_v1() to service_role;
grant execute on function public.update_kb_article_v1(uuid, text, text, text, public.article_status, int) to authenticated;
grant execute on function public.get_kb_article_embedding_state_v1(uuid) to authenticated;
grant execute on function public.request_kb_article_embedding_refresh_v1(uuid, integer) to authenticated;
grant execute on function public.claim_kb_chunk_set_from_webhook(uuid, text, uuid) to service_role;
grant execute on function public.claim_next_kb_chunk_set_for_ingestion(text, uuid, integer, integer, integer) to service_role;
grant execute on function public.complete_kb_chunk_set_ingestion(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.fail_kb_chunk_set_ingestion(uuid, text, text, text) to service_role;

comment on column public.knowledge_chunk_sets.ingestion_pipeline_version is
    'Version of the ingestion normalization/chunking pipeline that produced this chunk set.';

comment on column public.knowledge_chunks.ingestion_pipeline_version is
    'Debug snapshot of the ingestion pipeline version from the parent chunk set.';

comment on function public.get_kb_ingestion_pipeline_version_v1() is
    'Returns the current expected Knowledge Base ingestion pipeline version.';

comment on function public.ensure_kb_pending_chunk_set(uuid, text, text) is
    'Creates or reuses a pending Knowledge Base chunk set for the current title/content checksum and expected ingestion pipeline version.';

comment on function public.complete_kb_chunk_set_ingestion(uuid, text, text, text, jsonb) is
    'Atomically inserts completed chunks and switches the active chunk set after checksum, ownership, and ingestion pipeline version checks.';

comment on function public.fail_kb_chunk_set_ingestion(uuid, text, text, text) is
    'Marks the owned processing chunk set as failed while preserving the previous active set.';
