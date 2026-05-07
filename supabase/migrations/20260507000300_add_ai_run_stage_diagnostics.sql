-- Runtime blocker diagnostics: durable stage snapshot for AI runs.
--
-- Purpose:
-- - Supabase Edge Runtime can stop ai-orchestrator with EarlyDrop before JS cleanup.
-- - A processing/not_started row currently does not show the last reached backend stage.
-- - Stage diagnostics must stay backend-only and migration-driven.

alter table public.chat_ai_runs
    add column if not exists current_stage text,
    add column if not exists stage_started_at timestamptz,
    add column if not exists stage_error text;

alter table public.chat_ai_runs
    drop constraint if exists chat_ai_runs_current_stage_check,
    drop constraint if exists chat_ai_runs_stage_error_length_check;

alter table public.chat_ai_runs
    add constraint chat_ai_runs_current_stage_check
    check (
        current_stage is null
        or current_stage in (
            'processing_marked',
            'trigger_loaded',
            'retrieval_started',
            'embedding_started',
            'embedding_finished',
            'retrieval_rpc_started',
            'retrieval_saved',
            'failed'
        )
    ),
    add constraint chat_ai_runs_stage_error_length_check
    check (stage_error is null or char_length(stage_error) <= 500);

create or replace function public.update_chat_ai_run_stage(
    p_run_id uuid,
    p_current_stage text,
    p_stage_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_updated_id uuid;
begin
    if p_run_id is null then
        return jsonb_build_object('type', 'invalid_request', 'reason', 'run_id_required');
    end if;

    if p_current_stage is null
       or p_current_stage not in (
            'processing_marked',
            'trigger_loaded',
            'retrieval_started',
            'embedding_started',
            'embedding_finished',
            'retrieval_rpc_started',
            'retrieval_saved',
            'failed'
       )
    then
        return jsonb_build_object('type', 'invalid_request', 'reason', 'invalid_stage');
    end if;

    if p_stage_error is not null and char_length(p_stage_error) > 500 then
        return jsonb_build_object('type', 'invalid_request', 'reason', 'stage_error_too_long');
    end if;

    update public.chat_ai_runs
    set current_stage = p_current_stage,
        stage_started_at = now(),
        stage_error = nullif(p_stage_error, '')
    where id = p_run_id
    returning id into v_updated_id;

    if v_updated_id is null then
        return jsonb_build_object('type', 'not_found');
    end if;

    return jsonb_build_object(
        'type', 'updated',
        'run_id', v_updated_id,
        'current_stage', p_current_stage
    );
end;
$$;

alter function public.update_chat_ai_run_stage(uuid, text, text) owner to postgres;

revoke all on function public.update_chat_ai_run_stage(uuid, text, text)
from public, anon, authenticated;

grant execute on function public.update_chat_ai_run_stage(uuid, text, text)
to service_role;

comment on column public.chat_ai_runs.current_stage is
    'Backend-only durable snapshot of the last ai-orchestrator stage reached by this run.';

comment on column public.chat_ai_runs.stage_started_at is
    'Timestamp when current_stage was last updated by backend orchestration.';

comment on column public.chat_ai_runs.stage_error is
    'Sanitized enum-like stage failure message. Must not contain user text, prompt/context, provider payloads, or secrets.';

comment on function public.update_chat_ai_run_stage(uuid, text, text) is
    'Backend-only stage diagnostics update for chat_ai_runs. Does not change terminal run status or publish messages.';
