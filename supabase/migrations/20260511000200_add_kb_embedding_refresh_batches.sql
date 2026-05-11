-- Knowledge Base embeddings batch refresh workflow.
-- Adds durable batch state, service-role worker RPCs, and manager-facing read/start RPCs.

create table public.knowledge_embedding_refresh_batches (
    id uuid primary key default gen_random_uuid(),
    status text not null default 'running',
    requested_by_id uuid not null references public.managers(id) on delete restrict,
    total_count integer not null default 0 check (total_count >= 0),
    processed_count integer not null default 0 check (processed_count >= 0),
    completed_count integer not null default 0 check (completed_count >= 0),
    failed_count integer not null default 0 check (failed_count >= 0),
    skipped_count integer not null default 0 check (skipped_count >= 0),
    error_message text,
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint knowledge_embedding_refresh_batches_status_check
        check (status in ('running', 'completed', 'completed_with_errors', 'failed')),
    constraint knowledge_embedding_refresh_batches_counts_check
        check (
            processed_count = completed_count + failed_count + skipped_count
            and processed_count <= total_count
        ),
    constraint knowledge_embedding_refresh_batches_completed_at_check
        check (
            (status = 'running' and completed_at is null)
            or (status <> 'running' and completed_at is not null)
        )
);

create table public.knowledge_embedding_refresh_batch_items (
    id uuid primary key default gen_random_uuid(),
    batch_id uuid not null references public.knowledge_embedding_refresh_batches(id) on delete cascade,
    article_id uuid not null references public.knowledge_base_articles(id) on delete cascade,
    article_title text not null,
    article_version integer not null check (article_version > 0),
    status text not null default 'pending',
    result_type text,
    chunk_set_id uuid references public.knowledge_chunk_sets(id) on delete set null,
    processing_token text,
    processing_started_at timestamptz,
    processed_at timestamptz,
    attempt_count integer not null default 0 check (attempt_count >= 0),
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint knowledge_embedding_refresh_batch_items_status_check
        check (status in ('pending', 'processing', 'completed', 'failed', 'skipped')),
    constraint knowledge_embedding_refresh_batch_items_processing_check
        check (
            (status = 'processing' and processing_token is not null and processing_started_at is not null and processed_at is null)
            or (status <> 'processing' and processing_token is null)
        ),
    constraint knowledge_embedding_refresh_batch_items_terminal_check
        check (
            (status in ('completed', 'failed', 'skipped') and processed_at is not null and result_type is not null)
            or (status in ('pending', 'processing') and processed_at is null)
        ),
    constraint knowledge_embedding_refresh_batch_items_unique_article
        unique (batch_id, article_id)
);

create unique index knowledge_embedding_refresh_one_running_batch
    on public.knowledge_embedding_refresh_batches ((true))
    where status = 'running';

create index knowledge_embedding_refresh_batches_created_idx
    on public.knowledge_embedding_refresh_batches (created_at desc, id desc);

create index knowledge_embedding_refresh_batch_items_queue_idx
    on public.knowledge_embedding_refresh_batch_items (batch_id, status, created_at, id)
    where status in ('pending', 'processing');

create index knowledge_embedding_refresh_batch_items_errors_idx
    on public.knowledge_embedding_refresh_batch_items (batch_id, processed_at desc)
    where status in ('failed', 'skipped');

alter table public.knowledge_embedding_refresh_batches enable row level security;
alter table public.knowledge_embedding_refresh_batch_items enable row level security;

revoke all on public.knowledge_embedding_refresh_batches from public, anon, authenticated;
revoke all on public.knowledge_embedding_refresh_batch_items from public, anon, authenticated;
grant select, insert, update, delete on public.knowledge_embedding_refresh_batches to service_role;
grant select, insert, update, delete on public.knowledge_embedding_refresh_batch_items to service_role;

create or replace function public.touch_knowledge_embedding_refresh_batch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger set_knowledge_embedding_refresh_batches_updated_at
before update on public.knowledge_embedding_refresh_batches
for each row
execute function public.touch_knowledge_embedding_refresh_batch_updated_at();

create trigger set_knowledge_embedding_refresh_batch_items_updated_at
before update on public.knowledge_embedding_refresh_batch_items
for each row
execute function public.touch_knowledge_embedding_refresh_batch_updated_at();

create or replace function public.recalculate_kb_embedding_refresh_batch_v1(
    p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_total integer;
    v_completed integer;
    v_failed integer;
    v_skipped integer;
    v_processed integer;
    v_active integer;
    v_status text;
    v_batch public.knowledge_embedding_refresh_batches;
begin
    if p_batch_id is null then
        return jsonb_build_object('type', 'invalid_request');
    end if;

    select
        count(*)::integer,
        count(*) filter (where status = 'completed')::integer,
        count(*) filter (where status = 'failed')::integer,
        count(*) filter (where status = 'skipped')::integer,
        count(*) filter (where status in ('pending', 'processing'))::integer
    into v_total, v_completed, v_failed, v_skipped, v_active
    from public.knowledge_embedding_refresh_batch_items
    where batch_id = p_batch_id;

    v_processed := v_completed + v_failed + v_skipped;
    v_status := case
        when v_active > 0 then 'running'
        when v_failed > 0 then 'completed_with_errors'
        else 'completed'
    end;

    update public.knowledge_embedding_refresh_batches
    set
        status = v_status,
        total_count = v_total,
        processed_count = v_processed,
        completed_count = v_completed,
        failed_count = v_failed,
        skipped_count = v_skipped,
        completed_at = case
            when v_status = 'running' then null
            else coalesce(completed_at, now())
        end
    where id = p_batch_id
    returning * into v_batch;

    if not found then
        return jsonb_build_object('type', 'not_found');
    end if;

    return jsonb_build_object(
        'type', 'ok',
        'batch_id', v_batch.id,
        'status', v_batch.status,
        'total_count', v_batch.total_count,
        'processed_count', v_batch.processed_count,
        'completed_count', v_batch.completed_count,
        'failed_count', v_batch.failed_count,
        'skipped_count', v_batch.skipped_count
    );
end;
$$;

create or replace function public.get_kb_embeddings_summary_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_manager_id uuid;
    v_total integer := 0;
    v_published integer := 0;
    v_actual integer := 0;
    v_outdated integer := 0;
    v_updating integer := 0;
    v_failed integer := 0;
    v_unavailable integer := 0;
begin
    v_manager_id := public.get_current_manager_id_safe_v1();

    if v_manager_id is null then
        return jsonb_build_object(
            'type', 'forbidden',
            'total_count', 0,
            'published_count', 0,
            'actual_count', 0,
            'outdated_count', 0,
            'updating_count', 0,
            'failed_count', 0,
            'unavailable_count', 0,
            'refreshable_count', 0
        );
    end if;

    with article_state as (
        select
            a.id,
            a.status,
            count(current_set.id)::integer as current_count,
            count(active_set.id)::integer as active_count,
            max(current_set.id) as current_id,
            max(current_set.status) as current_status,
            bool_or(current_set.is_active) as current_is_active
        from public.knowledge_base_articles a
        left join public.knowledge_chunk_sets current_set
            on current_set.article_id = a.id
           and current_set.content_checksum = public.calculate_kb_content_checksum(a.title, a.content)
           and current_set.ingestion_pipeline_version = public.get_kb_ingestion_pipeline_version_v1()
        left join public.knowledge_chunk_sets active_set
            on active_set.article_id = a.id
           and active_set.is_active = true
        where a.status <> 'archived'::public.article_status
        group by a.id, a.status
    ),
    classified as (
        select
            status,
            case
                when status <> 'published'::public.article_status then 'unavailable'
                when current_count > 1 or active_count > 1 then 'unavailable'
                when current_id is null then 'outdated'
                when current_status in ('pending', 'processing') then 'updating'
                when current_status = 'failed' then 'failed'
                when current_status = 'completed' and current_is_active is true then 'actual'
                when current_status = 'completed' and current_is_active is not true then 'outdated'
                else 'unavailable'
            end as embedding_status
        from article_state
    )
    select
        count(*)::integer,
        count(*) filter (where status = 'published'::public.article_status)::integer,
        count(*) filter (where embedding_status = 'actual')::integer,
        count(*) filter (where embedding_status = 'outdated')::integer,
        count(*) filter (where embedding_status = 'updating')::integer,
        count(*) filter (where embedding_status = 'failed')::integer,
        count(*) filter (where embedding_status = 'unavailable')::integer
    into v_total, v_published, v_actual, v_outdated, v_updating, v_failed, v_unavailable
    from classified;

    return jsonb_build_object(
        'type', 'ok',
        'total_count', v_total,
        'published_count', v_published,
        'actual_count', v_actual,
        'outdated_count', v_outdated,
        'updating_count', v_updating,
        'failed_count', v_failed,
        'unavailable_count', v_unavailable,
        'refreshable_count', v_outdated + v_failed
    );
end;
$$;

create or replace function public.get_kb_embedding_refresh_batch_state_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_manager_id uuid;
    v_batch public.knowledge_embedding_refresh_batches;
    v_items jsonb := '[]'::jsonb;
begin
    v_manager_id := public.get_current_manager_id_safe_v1();

    if v_manager_id is null then
        return jsonb_build_object('type', 'forbidden', 'batch', null, 'items', '[]'::jsonb);
    end if;

    select *
    into v_batch
    from public.knowledge_embedding_refresh_batches
    order by
        case when status = 'running' then 0 else 1 end,
        created_at desc,
        id desc
    limit 1;

    if not found then
        return jsonb_build_object('type', 'ok', 'batch', null, 'items', '[]'::jsonb);
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', item.id,
                'article_id', item.article_id,
                'article_title', item.article_title,
                'article_version', item.article_version,
                'status', item.status,
                'result_type', item.result_type,
                'error_message', item.error_message,
                'processed_at', item.processed_at
            )
            order by item.processed_at desc nulls last, item.created_at asc
        ),
        '[]'::jsonb
    )
    into v_items
    from public.knowledge_embedding_refresh_batch_items item
    where item.batch_id = v_batch.id
      and item.status in ('failed', 'skipped');

    return jsonb_build_object(
        'type', 'ok',
        'batch', jsonb_build_object(
            'id', v_batch.id,
            'status', v_batch.status,
            'total_count', v_batch.total_count,
            'processed_count', v_batch.processed_count,
            'completed_count', v_batch.completed_count,
            'failed_count', v_batch.failed_count,
            'skipped_count', v_batch.skipped_count,
            'started_at', v_batch.started_at,
            'completed_at', v_batch.completed_at,
            'error_message', v_batch.error_message
        ),
        'items', v_items
    );
end;
$$;

create or replace function public.create_kb_embedding_refresh_batch_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_manager_id uuid;
    v_manager_role text;
    v_running public.knowledge_embedding_refresh_batches;
    v_batch_id uuid;
    v_total integer;
begin
    v_manager_id := public.get_current_manager_id_safe_v1();

    if v_manager_id is null then
        return jsonb_build_object('type', 'forbidden', 'batch_id', null);
    end if;

    select role
    into v_manager_role
    from public.managers
    where id = v_manager_id;

    if v_manager_role is null or v_manager_role not in ('admin', 'supervisor') then
        return jsonb_build_object('type', 'forbidden', 'batch_id', null);
    end if;

    select *
    into v_running
    from public.knowledge_embedding_refresh_batches
    where status = 'running'
    order by created_at desc
    limit 1;

    if found then
        return jsonb_build_object(
            'type', 'already_running',
            'batch_id', v_running.id
        );
    end if;

    with article_state as (
        select
            a.id,
            a.title,
            a.version,
            count(current_set.id)::integer as current_count,
            count(active_set.id)::integer as active_count,
            max(current_set.id) as current_id,
            max(current_set.status) as current_status,
            bool_or(current_set.is_active) as current_is_active
        from public.knowledge_base_articles a
        left join public.knowledge_chunk_sets current_set
            on current_set.article_id = a.id
           and current_set.content_checksum = public.calculate_kb_content_checksum(a.title, a.content)
           and current_set.ingestion_pipeline_version = public.get_kb_ingestion_pipeline_version_v1()
        left join public.knowledge_chunk_sets active_set
            on active_set.article_id = a.id
           and active_set.is_active = true
        where a.status = 'published'::public.article_status
        group by a.id, a.title, a.version
    ),
    candidates as (
        select
            id,
            title,
            version
        from article_state
        where case
            when current_count > 1 or active_count > 1 then 'unavailable'
            when current_id is null then 'outdated'
            when current_status in ('pending', 'processing') then 'updating'
            when current_status = 'failed' then 'failed'
            when current_status = 'completed' and current_is_active is true then 'actual'
            when current_status = 'completed' and current_is_active is not true then 'outdated'
            else 'unavailable'
        end in ('outdated', 'failed')
    )
    select count(*)::integer
    into v_total
    from candidates;

    if v_total = 0 then
        return jsonb_build_object('type', 'empty', 'batch_id', null);
    end if;

    insert into public.knowledge_embedding_refresh_batches (
        requested_by_id,
        total_count
    ) values (
        v_manager_id,
        v_total
    )
    returning id into v_batch_id;

    with article_state as (
        select
            a.id,
            a.title,
            a.version,
            count(current_set.id)::integer as current_count,
            count(active_set.id)::integer as active_count,
            max(current_set.id) as current_id,
            max(current_set.status) as current_status,
            bool_or(current_set.is_active) as current_is_active
        from public.knowledge_base_articles a
        left join public.knowledge_chunk_sets current_set
            on current_set.article_id = a.id
           and current_set.content_checksum = public.calculate_kb_content_checksum(a.title, a.content)
           and current_set.ingestion_pipeline_version = public.get_kb_ingestion_pipeline_version_v1()
        left join public.knowledge_chunk_sets active_set
            on active_set.article_id = a.id
           and active_set.is_active = true
        where a.status = 'published'::public.article_status
        group by a.id, a.title, a.version
    ),
    candidates as (
        select
            id,
            title,
            version
        from article_state
        where case
            when current_count > 1 or active_count > 1 then 'unavailable'
            when current_id is null then 'outdated'
            when current_status in ('pending', 'processing') then 'updating'
            when current_status = 'failed' then 'failed'
            when current_status = 'completed' and current_is_active is true then 'actual'
            when current_status = 'completed' and current_is_active is not true then 'outdated'
            else 'unavailable'
        end in ('outdated', 'failed')
    )
    insert into public.knowledge_embedding_refresh_batch_items (
        batch_id,
        article_id,
        article_title,
        article_version
    )
    select
        v_batch_id,
        id,
        title,
        version
    from candidates
    order by title, id;

    perform public.recalculate_kb_embedding_refresh_batch_v1(v_batch_id);

    return jsonb_build_object(
        'type', 'created',
        'batch_id', v_batch_id,
        'total_count', v_total
    );
exception
    when unique_violation then
        select *
        into v_running
        from public.knowledge_embedding_refresh_batches
        where status = 'running'
        order by created_at desc
        limit 1;

        return jsonb_build_object(
            'type', 'already_running',
            'batch_id', v_running.id
        );
end;
$$;

create or replace function public.claim_next_kb_embedding_refresh_batch_item_v1(
    p_processing_token text,
    p_stale_after_seconds integer default 600,
    p_max_attempts integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_stale_after interval;
    v_item_id uuid;
    v_item public.knowledge_embedding_refresh_batch_items;
begin
    if p_processing_token is null
       or btrim(p_processing_token) = ''
       or p_stale_after_seconds is null
       or p_stale_after_seconds <= 0
       or p_max_attempts is null
       or p_max_attempts <= 0 then
        return jsonb_build_object('type', 'invalid_request');
    end if;

    v_stale_after := make_interval(secs => p_stale_after_seconds);

    update public.knowledge_embedding_refresh_batch_items
    set
        status = 'pending',
        processing_token = null,
        processing_started_at = null,
        result_type = null,
        error_message = null
    where status = 'processing'
      and processing_started_at <= now() - v_stale_after
      and attempt_count < p_max_attempts;

    update public.knowledge_embedding_refresh_batch_items
    set
        status = 'failed',
        processing_token = null,
        result_type = 'STALE_PROCESSING_MAX_ATTEMPTS_REACHED',
        error_message = 'STALE_PROCESSING_MAX_ATTEMPTS_REACHED',
        processed_at = now()
    where status = 'processing'
      and processing_started_at <= now() - v_stale_after
      and attempt_count >= p_max_attempts;

    select item.id
    into v_item_id
    from public.knowledge_embedding_refresh_batch_items item
    join public.knowledge_embedding_refresh_batches batch on batch.id = item.batch_id
    where batch.status = 'running'
      and item.status = 'pending'
    order by batch.created_at asc, item.created_at asc, item.id asc
    for update skip locked
    limit 1;

    if v_item_id is null then
        return jsonb_build_object('type', 'empty');
    end if;

    update public.knowledge_embedding_refresh_batch_items
    set
        status = 'processing',
        processing_token = p_processing_token,
        processing_started_at = now(),
        attempt_count = attempt_count + 1,
        result_type = null,
        error_message = null
    where id = v_item_id
      and status = 'pending'
    returning * into v_item;

    if not found then
        return jsonb_build_object('type', 'not_claimed');
    end if;

    return jsonb_build_object(
        'type', 'claimed',
        'item_id', v_item.id,
        'batch_id', v_item.batch_id,
        'article_id', v_item.article_id,
        'article_title', v_item.article_title,
        'article_version', v_item.article_version,
        'attempt_count', v_item.attempt_count,
        'processing_token', p_processing_token
    );
end;
$$;

create or replace function public.request_kb_embedding_refresh_for_batch_item_v1(
    p_item_id uuid,
    p_processing_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_item public.knowledge_embedding_refresh_batch_items;
    v_article public.knowledge_base_articles;
    v_current_checksum text;
    v_pipeline_version text;
    v_current_count integer;
    v_active_count integer;
    v_article_processing_count integer;
    v_current_id uuid;
    v_current_status text;
    v_current_is_active boolean;
    v_chunk_set_id uuid;
    v_verified_checksum text;
    v_verified_status text;
    v_verified_pipeline_version text;
begin
    if p_item_id is null or p_processing_token is null or btrim(p_processing_token) = '' then
        return jsonb_build_object('type', 'invalid_request');
    end if;

    select *
    into v_item
    from public.knowledge_embedding_refresh_batch_items
    where id = p_item_id
    for update;

    if not found then
        return jsonb_build_object('type', 'not_found');
    end if;

    if v_item.status <> 'processing' or v_item.processing_token is distinct from p_processing_token then
        return jsonb_build_object('type', 'owner_mismatch');
    end if;

    select *
    into v_article
    from public.knowledge_base_articles
    where id = v_item.article_id
    for update;

    if not found then
        return jsonb_build_object('type', 'skipped', 'result_type', 'ARTICLE_NOT_FOUND');
    end if;

    if v_article.version is distinct from v_item.article_version then
        return jsonb_build_object('type', 'skipped', 'result_type', 'ARTICLE_VERSION_CHANGED');
    end if;

    if v_article.status <> 'published'::public.article_status then
        return jsonb_build_object('type', 'skipped', 'result_type', 'ARTICLE_NOT_PUBLISHED');
    end if;

    v_current_checksum := public.calculate_kb_content_checksum(v_article.title, v_article.content);
    v_pipeline_version := public.get_kb_ingestion_pipeline_version_v1();

    select
        count(*) filter (
            where content_checksum = v_current_checksum
              and ingestion_pipeline_version = v_pipeline_version
        ),
        count(*) filter (where is_active = true),
        count(*) filter (where status = 'processing')
    into
        v_current_count,
        v_active_count,
        v_article_processing_count
    from public.knowledge_chunk_sets
    where article_id = v_article.id;

    if v_current_count > 1 or v_active_count > 1 or v_article_processing_count > 1 then
        return jsonb_build_object(
            'type', 'unavailable',
            'result_type', 'INCONSISTENT_CHUNK_SETS'
        );
    end if;

    select id, status, is_active
    into v_current_id, v_current_status, v_current_is_active
    from public.knowledge_chunk_sets
    where article_id = v_article.id
      and content_checksum = v_current_checksum
      and ingestion_pipeline_version = v_pipeline_version;

    if v_current_id is not null and v_current_status in ('pending', 'processing') then
        return jsonb_build_object(
            'type', 'already_updating',
            'chunk_set_id', v_current_id,
            'result_type', 'ALREADY_UPDATING'
        );
    end if;

    if v_current_id is not null and v_current_status = 'completed' then
        if v_current_is_active is not true then
            update public.knowledge_chunk_sets
            set is_active = (id = v_current_id)
            where article_id = v_article.id
              and (id = v_current_id or is_active = true);
        end if;

        return jsonb_build_object(
            'type', 'already_actual',
            'chunk_set_id', v_current_id,
            'result_type', 'ALREADY_ACTUAL'
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
          and article_id = v_article.id
          and content_checksum = v_current_checksum
          and ingestion_pipeline_version = v_pipeline_version
          and status = 'failed'
        returning id into v_chunk_set_id;

        if v_chunk_set_id is null then
            return jsonb_build_object(
                'type', 'unavailable',
                'chunk_set_id', v_current_id,
                'result_type', 'FAILED_RETRY_UPDATE_LOST'
            );
        end if;

        return jsonb_build_object(
            'type', 'retry_queued',
            'chunk_set_id', v_chunk_set_id,
            'result_type', 'RETRY_QUEUED'
        );
    end if;

    if v_current_id is not null then
        return jsonb_build_object(
            'type', 'unavailable',
            'chunk_set_id', v_current_id,
            'result_type', 'UNKNOWN_CHUNK_SET_STATUS'
        );
    end if;

    v_chunk_set_id := public.ensure_kb_pending_chunk_set(v_article.id, v_article.title, v_article.content);

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
    into v_current_count, v_article_processing_count
    from public.knowledge_chunk_sets
    where article_id = v_article.id;

    select content_checksum, status, ingestion_pipeline_version
    into v_verified_checksum, v_verified_status, v_verified_pipeline_version
    from public.knowledge_chunk_sets
    where id = v_chunk_set_id
      and article_id = v_article.id
    for update;

    if v_chunk_set_id is null
       or v_current_count <> 1
       or v_article_processing_count <> 1
       or v_verified_checksum is distinct from v_current_checksum
       or v_verified_pipeline_version is distinct from v_pipeline_version
       or v_verified_status <> 'pending' then
        return jsonb_build_object(
            'type', 'unavailable',
            'chunk_set_id', v_chunk_set_id,
            'result_type', 'PENDING_CHUNK_SET_VERIFICATION_FAILED'
        );
    end if;

    return jsonb_build_object(
        'type', 'queued',
        'chunk_set_id', v_chunk_set_id,
        'result_type', 'QUEUED'
    );
end;
$$;

create or replace function public.finish_kb_embedding_refresh_batch_item_v1(
    p_item_id uuid,
    p_processing_token text,
    p_status text,
    p_result_type text,
    p_chunk_set_id uuid default null,
    p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_item public.knowledge_embedding_refresh_batch_items;
    v_recalculated jsonb;
begin
    if p_item_id is null
       or p_processing_token is null
       or btrim(p_processing_token) = ''
       or p_status not in ('completed', 'failed', 'skipped')
       or p_result_type is null
       or btrim(p_result_type) = '' then
        return jsonb_build_object('type', 'invalid_request');
    end if;

    update public.knowledge_embedding_refresh_batch_items
    set
        status = p_status,
        result_type = left(p_result_type, 120),
        chunk_set_id = p_chunk_set_id,
        processing_token = null,
        processed_at = now(),
        error_message = case
            when p_error_message is null then null
            else left(p_error_message, 1000)
        end
    where id = p_item_id
      and status = 'processing'
      and processing_token = p_processing_token
    returning * into v_item;

    if not found then
        return jsonb_build_object('type', 'owner_mismatch');
    end if;

    v_recalculated := public.recalculate_kb_embedding_refresh_batch_v1(v_item.batch_id);

    return jsonb_build_object(
        'type', 'ok',
        'item_id', v_item.id,
        'batch_id', v_item.batch_id,
        'status', v_item.status,
        'batch', v_recalculated
    );
end;
$$;

alter function public.touch_knowledge_embedding_refresh_batch_updated_at() owner to postgres;
alter function public.recalculate_kb_embedding_refresh_batch_v1(uuid) owner to postgres;
alter function public.get_kb_embeddings_summary_v1() owner to postgres;
alter function public.get_kb_embedding_refresh_batch_state_v1() owner to postgres;
alter function public.create_kb_embedding_refresh_batch_v1() owner to postgres;
alter function public.claim_next_kb_embedding_refresh_batch_item_v1(text, integer, integer) owner to postgres;
alter function public.request_kb_embedding_refresh_for_batch_item_v1(uuid, text) owner to postgres;
alter function public.finish_kb_embedding_refresh_batch_item_v1(uuid, text, text, text, uuid, text) owner to postgres;

revoke all on function public.touch_knowledge_embedding_refresh_batch_updated_at() from public, anon, authenticated;
revoke all on function public.recalculate_kb_embedding_refresh_batch_v1(uuid) from public, anon, authenticated;
revoke all on function public.get_kb_embeddings_summary_v1() from public, anon, authenticated;
revoke all on function public.get_kb_embedding_refresh_batch_state_v1() from public, anon, authenticated;
revoke all on function public.create_kb_embedding_refresh_batch_v1() from public, anon, authenticated;
revoke all on function public.claim_next_kb_embedding_refresh_batch_item_v1(text, integer, integer) from public, anon, authenticated;
revoke all on function public.request_kb_embedding_refresh_for_batch_item_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.finish_kb_embedding_refresh_batch_item_v1(uuid, text, text, text, uuid, text) from public, anon, authenticated;

grant execute on function public.get_kb_embeddings_summary_v1() to authenticated;
grant execute on function public.get_kb_embedding_refresh_batch_state_v1() to authenticated;
grant execute on function public.create_kb_embedding_refresh_batch_v1() to authenticated;
grant execute on function public.recalculate_kb_embedding_refresh_batch_v1(uuid) to service_role;
grant execute on function public.claim_next_kb_embedding_refresh_batch_item_v1(text, integer, integer) to service_role;
grant execute on function public.request_kb_embedding_refresh_for_batch_item_v1(uuid, text) to service_role;
grant execute on function public.finish_kb_embedding_refresh_batch_item_v1(uuid, text, text, text, uuid, text) to service_role;

comment on table public.knowledge_embedding_refresh_batches is
    'Durable batch runs for mass Knowledge Base embeddings refresh.';

comment on table public.knowledge_embedding_refresh_batch_items is
    'Per-article item state for a Knowledge Base embeddings refresh batch.';

comment on function public.get_kb_embeddings_summary_v1() is
    'Returns aggregate Knowledge Base embedding status counts for the admin header without N+1 article RPC calls.';

comment on function public.create_kb_embedding_refresh_batch_v1() is
    'Creates one running embeddings refresh batch for published articles with outdated or failed embeddings. Admin/supervisor only.';

comment on function public.claim_next_kb_embedding_refresh_batch_item_v1(text, integer, integer) is
    'Service-role worker claim RPC for the next pending Knowledge Base embeddings batch item.';

comment on function public.request_kb_embedding_refresh_for_batch_item_v1(uuid, text) is
    'Service-role refresh request for a claimed batch item. Reuses chunk-set invariants without requiring frontend auth context.';

comment on function public.finish_kb_embedding_refresh_batch_item_v1(uuid, text, text, text, uuid, text) is
    'Service-role terminal update for a claimed batch item and recalculates parent batch totals.';
