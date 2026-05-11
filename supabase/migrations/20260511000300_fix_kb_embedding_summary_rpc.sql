-- Fix Knowledge Base embedding summary/start batch RPCs.
-- Avoid calling the pipeline-version RPC inside aggregate join predicates.

create or replace function public.get_kb_embeddings_summary_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_manager_id uuid;
    v_pipeline_version text;
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

    v_pipeline_version := public.get_kb_ingestion_pipeline_version_v1();

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
           and current_set.ingestion_pipeline_version = v_pipeline_version
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

create or replace function public.create_kb_embedding_refresh_batch_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_manager_id uuid;
    v_manager_role text;
    v_pipeline_version text;
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

    v_pipeline_version := public.get_kb_ingestion_pipeline_version_v1();

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
           and current_set.ingestion_pipeline_version = v_pipeline_version
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
           and current_set.ingestion_pipeline_version = v_pipeline_version
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

alter function public.get_kb_embeddings_summary_v1() owner to postgres;
alter function public.create_kb_embedding_refresh_batch_v1() owner to postgres;

revoke all on function public.get_kb_embeddings_summary_v1() from public, anon, authenticated;
revoke all on function public.create_kb_embedding_refresh_batch_v1() from public, anon, authenticated;

grant execute on function public.get_kb_embeddings_summary_v1() to authenticated;
grant execute on function public.create_kb_embedding_refresh_batch_v1() to authenticated;
