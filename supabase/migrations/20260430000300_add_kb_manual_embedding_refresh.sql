-- Phase 8.1: manual Knowledge Base embedding refresh.
-- Adds a narrow UI state RPC and a policy-enforced refresh request RPC.

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

    select
        id,
        title,
        content,
        status
    into
        v_article_id,
        v_title,
        v_content,
        v_status
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

    select count(*)
    into v_current_count
    from public.knowledge_chunk_sets
    where article_id = v_article_id
      and content_checksum = v_current_checksum;

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

    select
        id,
        status,
        is_active,
        error_message
    into
        v_current_id,
        v_current_status,
        v_current_is_active,
        v_current_error_message
    from public.knowledge_chunk_sets
    where article_id = v_article_id
      and content_checksum = v_current_checksum;

    -- Safe because the count check above guarantees at most one active chunk set.
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
        'error_message', v_error_message
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
    v_current_count integer;
    v_active_count integer;
    v_current_processing_count integer;
    v_current_id uuid;
    v_current_status text;
    v_current_is_active boolean;
    v_locked_chunk_set_id uuid;
    v_chunk_set_id uuid;
    v_verified_checksum text;
    v_verified_status text;
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

    select
        id,
        title,
        content,
        status,
        version
    into
        v_article_id,
        v_title,
        v_content,
        v_status,
        v_version
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
        -- Intentional no-op: lock every chunk set for this article in a stable order.
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

    select
        count(*) filter (where content_checksum = v_current_checksum),
        count(*) filter (where is_active = true),
        count(*) filter (
            where content_checksum = v_current_checksum
              and status in ('pending', 'processing')
        )
    into
        v_current_count,
        v_active_count,
        v_current_processing_count
    from public.knowledge_chunk_sets
    where article_id = v_article_id;

    if v_current_count > 1 or v_active_count > 1 then
        return jsonb_build_object(
            'type', 'unavailable',
            'article_id', v_article_id,
            'chunk_set_id', null,
            'embedding_status', 'unavailable',
            'error_message', 'INCONSISTENT_CHUNK_SETS'
        );
    end if;

    select
        id,
        status,
        is_active
    into
        v_current_id,
        v_current_status,
        v_current_is_active
    from public.knowledge_chunk_sets
    where article_id = v_article_id
      and content_checksum = v_current_checksum;

    if v_current_id is not null
       and v_current_status in ('pending', 'processing') then
        return jsonb_build_object(
            'type', 'already_updating',
            'article_id', v_article_id,
            'chunk_set_id', v_current_id,
            'embedding_status', 'updating',
            'error_message', null
        );
    end if;

    if v_current_id is not null
       and v_current_status = 'completed' then
        if v_current_is_active is not true then
            update public.knowledge_chunk_sets
            set is_active = false
            where article_id = v_article_id
              and id <> v_current_id
              and is_active = true;

            update public.knowledge_chunk_sets
            set is_active = true
            where id = v_current_id
              and status = 'completed';
        end if;

        return jsonb_build_object(
            'type', 'already_actual',
            'article_id', v_article_id,
            'chunk_set_id', v_current_id,
            'embedding_status', 'actual',
            'error_message', null
        );
    end if;

    if v_current_id is not null
       and v_current_status = 'failed' then
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

        select count(*)
        into v_current_processing_count
        from public.knowledge_chunk_sets
        where article_id = v_article_id
          and content_checksum = v_current_checksum
          and status in ('pending', 'processing');

        if v_current_processing_count <> 1 then
            return jsonb_build_object(
                'type', 'unavailable',
                'article_id', v_article_id,
                'chunk_set_id', v_chunk_set_id,
                'embedding_status', 'unavailable',
                'error_message', 'PENDING_RETRY_VERIFICATION_FAILED'
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

    -- ensure_kb_pending_chunk_set must remain idempotent per (article_id, content_checksum).
    v_chunk_set_id := public.ensure_kb_pending_chunk_set(v_article_id, v_title, v_content);

    select
        count(*) filter (where content_checksum = v_current_checksum),
        count(*) filter (
            where content_checksum = v_current_checksum
              and status in ('pending', 'processing')
        )
    into
        v_current_count,
        v_current_processing_count
    from public.knowledge_chunk_sets
    where article_id = v_article_id;

    select
        content_checksum,
        status
    into
        v_verified_checksum,
        v_verified_status
    from public.knowledge_chunk_sets
    where id = v_chunk_set_id
      and article_id = v_article_id
    for update;

    if v_chunk_set_id is null
       or v_current_count <> 1
       or v_current_processing_count <> 1
       or v_verified_checksum is distinct from v_current_checksum
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

alter function public.get_kb_article_embedding_state_v1(uuid) owner to postgres;
alter function public.request_kb_article_embedding_refresh_v1(uuid, integer) owner to postgres;

revoke all on function public.get_kb_article_embedding_state_v1(uuid) from public;
revoke all on function public.get_kb_article_embedding_state_v1(uuid) from anon;
revoke all on function public.get_kb_article_embedding_state_v1(uuid) from authenticated;

revoke all on function public.request_kb_article_embedding_refresh_v1(uuid, integer) from public;
revoke all on function public.request_kb_article_embedding_refresh_v1(uuid, integer) from anon;
revoke all on function public.request_kb_article_embedding_refresh_v1(uuid, integer) from authenticated;

grant execute on function public.get_kb_article_embedding_state_v1(uuid) to authenticated;
grant execute on function public.request_kb_article_embedding_refresh_v1(uuid, integer) to authenticated;

comment on function public.get_kb_article_embedding_state_v1(uuid) is
    'Returns the minimal UI state for a Knowledge Base article embedding freshness.';

comment on function public.request_kb_article_embedding_refresh_v1(uuid, integer) is
    'Policy-enforced request to queue or retry manual Knowledge Base embedding refresh.';
