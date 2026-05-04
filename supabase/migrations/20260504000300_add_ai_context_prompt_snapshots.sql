-- Phase 9: AI context and prompt snapshots.
-- Backend-only audit trail for future LLM calls. No user-visible AI messages.

alter table public.chat_ai_runs
    add column if not exists context_snapshot jsonb,
    add column if not exists prompt_snapshot jsonb;

alter table public.chat_ai_runs
    drop constraint if exists chat_ai_runs_context_snapshot_check,
    drop constraint if exists chat_ai_runs_prompt_snapshot_check;

alter table public.chat_ai_runs
    add constraint chat_ai_runs_context_snapshot_check
        check (context_snapshot is null or jsonb_typeof(context_snapshot) = 'object'),
    add constraint chat_ai_runs_prompt_snapshot_check
        check (prompt_snapshot is null or jsonb_typeof(prompt_snapshot) = 'object');

create or replace function public.save_chat_ai_context_prompt_snapshot(
    p_run_id uuid,
    p_processing_token text,
    p_context_snapshot jsonb,
    p_prompt_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_run public.chat_ai_runs;
    v_chat_status text;
    v_latest_client_message_id uuid;
begin
    if p_run_id is null
       or p_processing_token is null
       or btrim(p_processing_token) = ''
       or p_context_snapshot is null
       or jsonb_typeof(p_context_snapshot) <> 'object'
       or p_prompt_snapshot is null
       or jsonb_typeof(p_prompt_snapshot) <> 'object' then
        return jsonb_build_object('type', 'invalid_request', 'run_id', p_run_id);
    end if;

    select *
    into v_run
    from public.chat_ai_runs
    where id = p_run_id
    for update;

    if not found then
        return jsonb_build_object('type', 'not_found', 'run_id', p_run_id);
    end if;

    if v_run.status in ('completed', 'failed', 'obsolete', 'ignored') then
        if v_run.processing_token = p_processing_token
           and v_run.context_snapshot is not distinct from p_context_snapshot
           and v_run.prompt_snapshot is not distinct from p_prompt_snapshot then
            return jsonb_build_object(
                'type', 'already_saved',
                'run_id', v_run.id,
                'status', v_run.status
            );
        end if;

        return jsonb_build_object(
            'type', 'already_terminal',
            'run_id', v_run.id,
            'status', v_run.status
        );
    end if;

    if v_run.status <> 'processing'
       or v_run.processing_token is null
       or v_run.processing_token <> p_processing_token then
        return jsonb_build_object('type', 'owner_mismatch', 'run_id', v_run.id);
    end if;

    if v_run.retrieval_status <> 'hit'
       or coalesce(v_run.matched_chunks_count, 0) <= 0
       or v_run.retrieval_chunks is null
       or jsonb_typeof(v_run.retrieval_chunks) <> 'array'
       or jsonb_array_length(v_run.retrieval_chunks) = 0 then
        return jsonb_build_object('type', 'retrieval_not_hit', 'run_id', v_run.id);
    end if;

    select status
    into v_chat_status
    from public.chats
    where id = v_run.chat_id;

    if v_chat_status in ('waiting_operator', 'resolved', 'closed') then
        update public.chat_ai_runs
        set
            status = 'ignored',
            completed_at = now()
        where id = v_run.id
          and status = 'processing'
          and processing_token = p_processing_token;

        return jsonb_build_object('type', 'ignored', 'run_id', v_run.id);
    end if;

    select cm.id
    into v_latest_client_message_id
    from public.chat_messages cm
    where cm.chat_id = v_run.chat_id
      and cm.sender_type = 'client'
    order by cm.created_at desc, cm.id desc
    limit 1;

    if v_latest_client_message_id is distinct from v_run.trigger_message_id then
        update public.chat_ai_runs
        set
            status = 'obsolete',
            completed_at = now()
        where id = v_run.id
          and status = 'processing'
          and processing_token = p_processing_token;

        return jsonb_build_object('type', 'obsolete', 'run_id', v_run.id);
    end if;

    update public.chat_ai_runs
    set
        context_snapshot = p_context_snapshot,
        prompt_snapshot = p_prompt_snapshot
    where id = v_run.id
      and status = 'processing'
      and processing_token = p_processing_token;

    return jsonb_build_object(
        'type', 'saved',
        'run_id', v_run.id
    );
end;
$$;

alter function public.save_chat_ai_context_prompt_snapshot(uuid, text, jsonb, jsonb) owner to postgres;

revoke all on function public.save_chat_ai_context_prompt_snapshot(uuid, text, jsonb, jsonb) from public, anon, authenticated;

grant execute on function public.save_chat_ai_context_prompt_snapshot(uuid, text, jsonb, jsonb) to service_role;

comment on column public.chat_ai_runs.context_snapshot is
    'Backend-only diagnostic snapshot of current message, selected history, KB fragments, and applied limits.';

comment on column public.chat_ai_runs.prompt_snapshot is
    'Backend-only provider-neutral prompt messages prepared for a future LLM call.';

comment on function public.save_chat_ai_context_prompt_snapshot(uuid, text, jsonb, jsonb) is
    'Only approved write path for Phase 9 context/prompt snapshots. Checks ownership, hit retrieval state, and trigger relevance.';
