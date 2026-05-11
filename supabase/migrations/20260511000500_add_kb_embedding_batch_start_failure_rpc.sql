-- Close a Knowledge Base embedding refresh batch when the worker cannot be started.

create or replace function public.fail_kb_embedding_refresh_batch_start_v1(
    p_batch_id uuid,
    p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_manager_id uuid;
    v_manager_role text;
    v_batch public.knowledge_embedding_refresh_batches;
    v_recalculated jsonb;
begin
    if p_batch_id is null then
        return jsonb_build_object('type', 'invalid_request');
    end if;

    v_manager_id := public.get_current_manager_id_safe_v1();

    if v_manager_id is null then
        return jsonb_build_object('type', 'forbidden');
    end if;

    select role
    into v_manager_role
    from public.managers
    where id = v_manager_id;

    if v_manager_role is null or v_manager_role not in ('admin', 'supervisor') then
        return jsonb_build_object('type', 'forbidden');
    end if;

    select *
    into v_batch
    from public.knowledge_embedding_refresh_batches
    where id = p_batch_id
    for update;

    if not found then
        return jsonb_build_object('type', 'not_found');
    end if;

    if v_batch.status <> 'running' then
        return jsonb_build_object(
            'type', 'already_terminal',
            'batch_id', v_batch.id,
            'status', v_batch.status
        );
    end if;

    update public.knowledge_embedding_refresh_batch_items
    set
        status = 'failed',
        result_type = 'WORKER_START_FAILED',
        processing_token = null,
        processed_at = coalesce(processed_at, now()),
        error_message = left(coalesce(p_error_message, 'WORKER_START_FAILED'), 1000)
    where batch_id = p_batch_id
      and status in ('pending', 'processing');

    v_recalculated := public.recalculate_kb_embedding_refresh_batch_v1(p_batch_id);

    update public.knowledge_embedding_refresh_batches
    set
        status = 'failed',
        completed_at = coalesce(completed_at, now()),
        error_message = left(coalesce(p_error_message, 'WORKER_START_FAILED'), 1000)
    where id = p_batch_id
      and status <> 'running';

    return jsonb_build_object(
        'type', 'failed',
        'batch_id', p_batch_id,
        'batch', v_recalculated
    );
end;
$$;

alter function public.fail_kb_embedding_refresh_batch_start_v1(uuid, text) owner to postgres;

revoke all on function public.fail_kb_embedding_refresh_batch_start_v1(uuid, text)
from public, anon, authenticated;

grant execute on function public.fail_kb_embedding_refresh_batch_start_v1(uuid, text)
to authenticated;

comment on function public.fail_kb_embedding_refresh_batch_start_v1(uuid, text) is
    'Admin/supervisor recovery RPC: marks a running KB embedding refresh batch as failed when the Edge Function worker cannot be started.';
