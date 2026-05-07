-- Runtime blocker fix: controlled recovery for stale AI runs.
--
-- Purpose:
-- - Supabase Edge Runtime can stop an invocation before JS cleanup runs.
-- - A stale pending/processing chat_ai_runs row blocks the next AI run through
--   chat_ai_runs_one_active_per_chat and start_chat_ai_run active_run_exists.
-- - Recovery must stay backend-only and migration-driven, not a manual table UPDATE.

create or replace function public.recover_stale_chat_ai_runs(
    p_chat_id uuid default null,
    p_stale_after_minutes integer default 10,
    p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_stale_after_minutes integer;
    v_limit integer;
    v_run_ids uuid[];
begin
    v_stale_after_minutes := coalesce(p_stale_after_minutes, 10);
    v_limit := coalesce(p_limit, 20);

    if v_stale_after_minutes < 1 or v_stale_after_minutes > 120 then
        return jsonb_build_object(
            'type', 'invalid_request',
            'recovered_count', 0,
            'run_ids', '[]'::jsonb,
            'stale_after_minutes', v_stale_after_minutes
        );
    end if;

    if v_limit < 1 or v_limit > 100 then
        return jsonb_build_object(
            'type', 'invalid_request',
            'recovered_count', 0,
            'run_ids', '[]'::jsonb,
            'stale_after_minutes', v_stale_after_minutes
        );
    end if;

    with stale_runs as (
        select id
        from public.chat_ai_runs
        where status in ('pending', 'processing')
          and response_message_id is null
          and coalesce(started_at, created_at) < now() - make_interval(mins => v_stale_after_minutes)
          and (p_chat_id is null or chat_id = p_chat_id)
        order by coalesce(started_at, created_at), id
        limit v_limit
        for update skip locked
    ),
    recovered_runs as (
        update public.chat_ai_runs runs
        set status = 'failed',
            error_type = 'system',
            error_message = 'STALE_AI_RUN_RECOVERED',
            completed_at = now()
        from stale_runs
        where runs.id = stale_runs.id
        returning runs.id
    )
    select coalesce(array_agg(id), array[]::uuid[])
    into v_run_ids
    from recovered_runs;

    return jsonb_build_object(
        'type', case when cardinality(v_run_ids) > 0 then 'recovered' else 'none' end,
        'recovered_count', cardinality(v_run_ids),
        'run_ids', coalesce(to_jsonb(v_run_ids), '[]'::jsonb),
        'stale_after_minutes', v_stale_after_minutes
    );
end;
$$;

alter function public.recover_stale_chat_ai_runs(uuid, integer, integer) owner to postgres;

revoke all on function public.recover_stale_chat_ai_runs(uuid, integer, integer)
from public, anon, authenticated;

grant execute on function public.recover_stale_chat_ai_runs(uuid, integer, integer)
to service_role;

comment on function public.recover_stale_chat_ai_runs(uuid, integer, integer) is
    'Backend-only controlled recovery for stale pending/processing AI runs. Does not publish messages or modify chat status.';
