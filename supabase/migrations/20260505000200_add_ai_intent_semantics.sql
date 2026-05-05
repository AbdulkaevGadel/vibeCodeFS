-- Phase 11 follow-up: explicit AI intent semantics and skipped retrieval audit.
-- Adds honest audit values for deterministic non-RAG replies without editing applied migrations.

alter table public.chat_ai_runs
    add column if not exists intent_type text;

alter table public.chat_ai_runs
    drop constraint if exists chat_ai_runs_retrieval_status_check,
    drop constraint if exists chat_ai_runs_response_kind_check,
    drop constraint if exists chat_ai_runs_intent_type_check;

alter table public.chat_ai_runs
    add constraint chat_ai_runs_retrieval_status_check
        check (retrieval_status in ('not_started', 'hit', 'miss', 'empty', 'failed', 'skipped')),
    add constraint chat_ai_runs_response_kind_check
        check (response_kind in ('none', 'answer', 'clarify', 'handoff', 'intent_reply')),
    add constraint chat_ai_runs_intent_type_check
        check (
            intent_type is null
            or intent_type in ('greeting', 'thanks', 'farewell', 'manager_request')
        );

create or replace function public.start_chat_ai_run(
    p_chat_id uuid,
    p_trigger_message_id uuid,
    p_prompt_version text,
    p_correlation_id text default null,
    p_config_snapshot jsonb default null,
    p_config_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_chat_status text;
    v_trigger_sender_type text;
    v_latest_client_message_id uuid;
    v_existing_run_id uuid;
    v_active_run_id uuid;
    v_run_id uuid;
begin
    if p_chat_id is null or p_trigger_message_id is null then
        return jsonb_build_object('type', 'invalid_trigger', 'run_id', null);
    end if;

    if p_prompt_version is null or trim(p_prompt_version) = '' then
        return jsonb_build_object('type', 'invalid_trigger', 'run_id', null);
    end if;

    select status
    into v_chat_status
    from public.chats
    where id = p_chat_id
    for update;

    if v_chat_status is null then
        return jsonb_build_object('type', 'invalid_trigger', 'run_id', null);
    end if;

    if v_chat_status in ('waiting_operator', 'in_progress', 'resolved', 'closed') then
        return jsonb_build_object('type', 'chat_not_ai_eligible', 'run_id', null);
    end if;

    select sender_type
    into v_trigger_sender_type
    from public.chat_messages
    where id = p_trigger_message_id
      and chat_id = p_chat_id;

    if v_trigger_sender_type is distinct from 'client' then
        return jsonb_build_object('type', 'invalid_trigger', 'run_id', null);
    end if;

    select id
    into v_existing_run_id
    from public.chat_ai_runs
    where chat_id = p_chat_id
      and trigger_message_id = p_trigger_message_id;

    if v_existing_run_id is not null then
        return jsonb_build_object('type', 'duplicate', 'run_id', v_existing_run_id);
    end if;

    select id
    into v_latest_client_message_id
    from public.chat_messages
    where chat_id = p_chat_id
      and sender_type = 'client'
    order by created_at desc, id desc
    limit 1;

    if v_latest_client_message_id is distinct from p_trigger_message_id then
        return jsonb_build_object('type', 'stale_trigger', 'run_id', null);
    end if;

    select id
    into v_active_run_id
    from public.chat_ai_runs
    where chat_id = p_chat_id
      and status in ('pending', 'processing')
    order by created_at desc, id desc
    limit 1;

    if v_active_run_id is not null then
        return jsonb_build_object('type', 'active_run_exists', 'run_id', v_active_run_id);
    end if;

    begin
        insert into public.chat_ai_runs (
            chat_id,
            trigger_message_id,
            status,
            retrieval_status,
            response_kind,
            prompt_version,
            config_snapshot,
            config_hash,
            correlation_id
        ) values (
            p_chat_id,
            p_trigger_message_id,
            'pending',
            'not_started',
            'none',
            p_prompt_version,
            p_config_snapshot,
            p_config_hash,
            p_correlation_id
        )
        returning id into v_run_id;
    exception
        when unique_violation then
            select id
            into v_existing_run_id
            from public.chat_ai_runs
            where chat_id = p_chat_id
              and trigger_message_id = p_trigger_message_id;

            if v_existing_run_id is not null then
                return jsonb_build_object('type', 'duplicate', 'run_id', v_existing_run_id);
            end if;

            select id
            into v_active_run_id
            from public.chat_ai_runs
            where chat_id = p_chat_id
              and status in ('pending', 'processing')
            order by created_at desc, id desc
            limit 1;

            return jsonb_build_object('type', 'active_run_exists', 'run_id', v_active_run_id);
    end;

    return jsonb_build_object(
        'type', 'started',
        'run_id', v_run_id
    );
end;
$$;

alter function public.start_chat_ai_run(uuid, uuid, text, text, jsonb, text) owner to postgres;

revoke all on function public.start_chat_ai_run(uuid, uuid, text, text, jsonb, text) from public, anon, authenticated;

grant execute on function public.start_chat_ai_run(uuid, uuid, text, text, jsonb, text) to service_role;

create or replace function public.save_chat_ai_intent_result(
    p_run_id uuid,
    p_processing_token text,
    p_intent_type text
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
       or p_intent_type not in ('greeting', 'thanks', 'farewell', 'manager_request') then
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
           and v_run.retrieval_status = 'skipped'
           and v_run.intent_type = p_intent_type then
            return jsonb_build_object(
                'type', 'already_saved',
                'run_id', v_run.id,
                'status', v_run.status,
                'intent_type', v_run.intent_type
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

    select status
    into v_chat_status
    from public.chats
    where id = v_run.chat_id;

    if v_chat_status in ('waiting_operator', 'in_progress', 'resolved', 'closed') then
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
        retrieval_status = 'skipped',
        top_similarity_score = null,
        matched_chunks_count = 0,
        retrieval_chunks = '[]'::jsonb,
        intent_type = p_intent_type,
        error_message = null,
        error_type = null
    where id = v_run.id
      and status = 'processing'
      and processing_token = p_processing_token;

    return jsonb_build_object(
        'type', 'saved',
        'run_id', v_run.id,
        'retrieval_status', 'skipped',
        'intent_type', p_intent_type
    );
end;
$$;

alter function public.save_chat_ai_intent_result(uuid, text, text) owner to postgres;

revoke all on function public.save_chat_ai_intent_result(uuid, text, text) from public, anon, authenticated;

grant execute on function public.save_chat_ai_intent_result(uuid, text, text) to service_role;

create or replace function public.publish_chat_ai_response(
    p_run_id uuid,
    p_processing_token text,
    p_response_kind text,
    p_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_run public.chat_ai_runs;
    v_chat public.chats;
    v_latest_client_message_id uuid;
    v_message_id uuid;
    v_existing_message public.chat_messages;
    v_trimmed_text text;
    v_previous_status text;
begin
    v_trimmed_text := btrim(coalesce(p_text, ''));

    if p_run_id is null
       or p_processing_token is null
       or btrim(p_processing_token) = ''
       or p_response_kind not in ('answer', 'clarify', 'handoff', 'intent_reply')
       or v_trimmed_text = ''
       or length(v_trimmed_text) > 4000 then
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
        if v_run.response_message_id is not null then
            select *
            into v_existing_message
            from public.chat_messages
            where id = v_run.response_message_id;

            select *
            into v_chat
            from public.chats
            where id = v_run.chat_id;

            return jsonb_build_object(
                'type', 'already_published',
                'run_id', v_run.id,
                'status', v_run.status,
                'response_kind', v_run.response_kind,
                'message_id', v_run.response_message_id,
                'telegram_chat_id', v_chat.telegram_chat_id,
                'text', v_existing_message.text
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

    if p_response_kind = 'answer'
       and (
           v_run.retrieval_status <> 'hit'
           or v_run.context_snapshot is null
           or v_run.prompt_snapshot is null
           or v_run.intent_type is not null
       ) then
        return jsonb_build_object('type', 'answer_requires_hit', 'run_id', v_run.id);
    end if;

    if p_response_kind in ('clarify', 'handoff')
       and v_run.intent_type is null
       and v_run.retrieval_status not in ('hit', 'miss', 'empty') then
        return jsonb_build_object('type', 'business_miss_requires_non_failed_retrieval', 'run_id', v_run.id);
    end if;

    if p_response_kind = 'intent_reply'
       and (
           v_run.retrieval_status <> 'skipped'
           or v_run.intent_type is null
           or v_run.intent_type not in ('greeting', 'thanks', 'farewell')
       ) then
        return jsonb_build_object('type', 'intent_reply_requires_skipped_intent', 'run_id', v_run.id);
    end if;

    if p_response_kind = 'handoff'
       and v_run.intent_type is not null
       and (
           v_run.retrieval_status <> 'skipped'
           or v_run.intent_type is distinct from 'manager_request'
       ) then
        return jsonb_build_object('type', 'handoff_intent_requires_manager_request', 'run_id', v_run.id);
    end if;

    if p_response_kind in ('answer', 'clarify', 'intent_reply')
       and v_run.intent_type = 'manager_request' then
        return jsonb_build_object('type', 'manager_request_requires_handoff', 'run_id', v_run.id);
    end if;

    select *
    into v_chat
    from public.chats
    where id = v_run.chat_id
    for update;

    if not found then
        return jsonb_build_object('type', 'chat_not_found', 'run_id', v_run.id);
    end if;

    if v_chat.status in ('waiting_operator', 'in_progress', 'resolved', 'closed') then
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

    insert into public.chat_messages (
        chat_id,
        sender_type,
        manager_id,
        text,
        delivery_status,
        created_at
    ) values (
        v_run.chat_id,
        'ai',
        null,
        v_trimmed_text,
        'pending',
        now()
    )
    returning id into v_message_id;

    update public.chat_ai_runs
    set
        status = 'completed',
        response_kind = p_response_kind,
        response_message_id = v_message_id,
        error_message = null,
        error_type = null,
        completed_at = now()
    where id = v_run.id
      and status = 'processing'
      and processing_token = p_processing_token;

    update public.chats
    set
        last_message_at = now(),
        updated_at = now()
    where id = v_run.chat_id;

    if p_response_kind = 'handoff' then
        v_previous_status := v_chat.status;

        delete from public.chat_assignments
        where chat_id = v_run.chat_id;

        update public.chats
        set
            status = 'waiting_operator',
            updated_at = now()
        where id = v_run.chat_id;

        insert into public.chat_status_history (
            chat_id,
            from_status,
            to_status,
            changed_by_manager_id
        ) values (
            v_run.chat_id,
            v_previous_status,
            'waiting_operator',
            null
        );
    end if;

    return jsonb_build_object(
        'type', 'published',
        'run_id', v_run.id,
        'status', 'completed',
        'response_kind', p_response_kind,
        'message_id', v_message_id,
        'telegram_chat_id', v_chat.telegram_chat_id,
        'text', v_trimmed_text
    );
end;
$$;

alter function public.publish_chat_ai_response(uuid, text, text, text) owner to postgres;

revoke all on function public.publish_chat_ai_response(uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.publish_chat_ai_response(uuid, text, text, text) to service_role;

comment on column public.chat_ai_runs.intent_type is
    'Deterministic backend intent audit for non-RAG AI behavior.';

comment on function public.start_chat_ai_run(uuid, uuid, text, text, jsonb, text) is
    'Starts one backend AI run for eligible open/escalated chats. Human-handled in_progress chats are not AI-eligible.';

comment on function public.save_chat_ai_intent_result(uuid, text, text) is
    'Backend-only write path for deterministic AI intent audit. Marks retrieval as skipped after run ownership is acquired.';

comment on function public.publish_chat_ai_response(uuid, text, text, text) is
    'Backend-only publish path for AI messages. Supports RAG answer/clarify/handoff and deterministic intent replies without exposing AI internals to frontend.';
