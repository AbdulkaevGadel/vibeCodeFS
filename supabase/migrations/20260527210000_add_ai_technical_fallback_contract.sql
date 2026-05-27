-- Adds explicit backend contract for user-facing technical fallback AI responses.
-- Existing applied migrations are not edited; this migration extends the current contract.

alter table public.chat_ai_runs
    drop constraint if exists chat_ai_runs_response_kind_check;

alter table public.chat_ai_runs
    add constraint chat_ai_runs_response_kind_check
        check (response_kind in ('none', 'answer', 'clarify', 'handoff', 'intent_reply', 'technical_fallback'));

create or replace function public.mark_chat_ai_run_external_error(
    p_run_id uuid,
    p_processing_token text,
    p_error_message text,
    p_error_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_run public.chat_ai_runs;
begin
    if p_run_id is null
       or p_processing_token is null
       or btrim(p_processing_token) = ''
       or p_error_type is distinct from 'external' then
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

    if v_run.error_type = 'external'
       and v_run.error_message = left(coalesce(p_error_message, 'AI_EXTERNAL_FAILURE'), 500) then
        return jsonb_build_object(
            'type', 'already_recorded',
            'run_id', v_run.id,
            'status', v_run.status
        );
    end if;

    update public.chat_ai_runs
    set
        error_message = left(coalesce(p_error_message, 'AI_EXTERNAL_FAILURE'), 500),
        error_type = 'external'
    where id = v_run.id
      and status = 'processing'
      and processing_token = p_processing_token;

    return jsonb_build_object(
        'type', 'updated',
        'run_id', v_run.id,
        'status', 'processing'
    );
end;
$$;

alter function public.mark_chat_ai_run_external_error(uuid, text, text, text) owner to postgres;

revoke all on function public.mark_chat_ai_run_external_error(uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.mark_chat_ai_run_external_error(uuid, text, text, text) to service_role;

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
       or p_response_kind not in ('answer', 'clarify', 'handoff', 'intent_reply', 'technical_fallback')
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

    if p_response_kind = 'technical_fallback'
       and (
           v_run.error_type is distinct from 'external'
           or v_run.intent_type is not null
           or v_run.response_message_id is not null
           or v_run.response_kind <> 'none'
       ) then
        return jsonb_build_object('type', 'technical_fallback_requires_external_error', 'run_id', v_run.id);
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
        error_message = case
            when p_response_kind = 'technical_fallback' then error_message
            else null
        end,
        error_type = case
            when p_response_kind = 'technical_fallback' then error_type
            else null
        end,
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

comment on function public.mark_chat_ai_run_external_error(uuid, text, text, text) is
    'Backend-only audit path for controlled external AI failures before publishing a technical fallback.';

comment on function public.publish_chat_ai_response(uuid, text, text, text) is
    'Backend-only publish path for AI messages. Supports RAG answer/clarify/handoff, deterministic intent replies, and technical fallback responses without exposing AI internals to frontend.';
