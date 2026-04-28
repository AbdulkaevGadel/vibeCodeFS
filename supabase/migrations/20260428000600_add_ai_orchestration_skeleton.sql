-- Phase 5: AI orchestration skeleton and run lifecycle RPCs.
-- No LLM, no retrieval, no AI messages.

alter table public.chat_ai_runs
    add column if not exists processing_token text,
    add column if not exists config_snapshot jsonb,
    add column if not exists config_hash text,
    add column if not exists correlation_id text,
    add column if not exists error_type text;

alter table public.chat_ai_runs
    drop constraint if exists chat_ai_runs_error_type_check;

alter table public.chat_ai_runs
    add constraint chat_ai_runs_error_type_check
        check (error_type is null or error_type in ('validation', 'system', 'external'));

create index if not exists chat_ai_runs_correlation_id_idx
    on public.chat_ai_runs (correlation_id)
    where correlation_id is not null;

drop function if exists public.process_incoming_telegram_message(
    bigint,
    varchar,
    varchar,
    varchar,
    bigint,
    varchar,
    bigint,
    text
);

create function public.process_incoming_telegram_message(
    p_telegram_user_id bigint,
    p_username varchar,
    p_first_name varchar,
    p_last_name varchar,
    p_telegram_chat_id bigint,
    p_bot_username varchar,
    p_telegram_message_id bigint,
    p_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_client_id uuid;
    v_chat_id uuid;
    v_message_id uuid;
    v_message_created_at timestamptz;
begin
    insert into public.clients (
        telegram_user_id,
        username,
        first_name,
        last_name,
        updated_at
    ) values (
        p_telegram_user_id,
        p_username,
        p_first_name,
        p_last_name,
        now()
    )
    on conflict (telegram_user_id) do update
    set
        username = coalesce(excluded.username, clients.username),
        first_name = coalesce(excluded.first_name, clients.first_name),
        last_name = coalesce(excluded.last_name, clients.last_name),
        updated_at = now()
    returning id into v_client_id;

    insert into public.chats (
        telegram_chat_id,
        client_id,
        bot_username,
        status,
        updated_at
    ) values (
        p_telegram_chat_id,
        v_client_id,
        p_bot_username,
        'open',
        now()
    )
    on conflict (telegram_chat_id, bot_username) do update
    set
        client_id = excluded.client_id,
        updated_at = now()
    returning id into v_chat_id;

    insert into public.chat_messages (
        chat_id,
        sender_type,
        text,
        telegram_message_id,
        created_at
    ) values (
        v_chat_id,
        'client',
        p_text,
        p_telegram_message_id,
        now()
    )
    on conflict (chat_id, telegram_message_id) do nothing
    returning id, created_at into v_message_id, v_message_created_at;

    if v_message_id is not null then
        update public.chats
        set
            last_message_at = v_message_created_at,
            updated_at = now()
        where id = v_chat_id;

        return jsonb_build_object(
            'chat_id', v_chat_id,
            'message_id', v_message_id,
            'inserted', true,
            'is_duplicate', false
        );
    end if;

    select id
    into v_message_id
    from public.chat_messages
    where chat_id = v_chat_id
      and telegram_message_id = p_telegram_message_id;

    return jsonb_build_object(
        'chat_id', v_chat_id,
        'message_id', v_message_id,
        'inserted', false,
        'is_duplicate', true
    );
end;
$$;

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

    if v_chat_status in ('waiting_operator', 'resolved', 'closed') then
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

    return jsonb_build_object('type', 'started', 'run_id', v_run_id);
end;
$$;

create or replace function public.mark_chat_ai_run_processing(
    p_run_id uuid,
    p_processing_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_run record;
    v_latest_client_message_id uuid;
begin
    if p_run_id is null or p_processing_token is null or trim(p_processing_token) = '' then
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
        return jsonb_build_object('type', 'already_terminal', 'run_id', v_run.id, 'status', v_run.status);
    end if;

    if v_run.status = 'processing' then
        if v_run.processing_token = p_processing_token then
            return jsonb_build_object('type', 'already_processing', 'run_id', v_run.id);
        end if;

        return jsonb_build_object('type', 'owned_by_another_worker', 'run_id', v_run.id);
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
          and status = 'pending';

        return jsonb_build_object('type', 'obsolete', 'run_id', v_run.id);
    end if;

    update public.chat_ai_runs
    set
        status = 'processing',
        started_at = now(),
        processing_token = p_processing_token
    where id = v_run.id
      and status = 'pending'
      and processing_token is null;

    return jsonb_build_object('type', 'processing', 'run_id', v_run.id);
end;
$$;

create or replace function public.finish_chat_ai_run(
    p_run_id uuid,
    p_processing_token text,
    p_final_status text,
    p_error_message text default null,
    p_error_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_run record;
    v_chat_status text;
    v_latest_client_message_id uuid;
    v_effective_status text;
    v_error_message text;
    v_error_type text;
begin
    if p_run_id is null then
        return jsonb_build_object('type', 'invalid_request', 'run_id', null);
    end if;

    if p_final_status not in ('completed', 'failed', 'obsolete', 'ignored') then
        return jsonb_build_object('type', 'invalid_final_status', 'run_id', p_run_id);
    end if;

    if p_error_type is not null and p_error_type not in ('validation', 'system', 'external') then
        return jsonb_build_object('type', 'invalid_error_type', 'run_id', p_run_id);
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

    if v_run.processing_token is null
       or p_processing_token is null
       or v_run.processing_token <> p_processing_token then
        return jsonb_build_object('type', 'owner_mismatch', 'run_id', v_run.id);
    end if;

    select status
    into v_chat_status
    from public.chats
    where id = v_run.chat_id;

    v_effective_status := p_final_status;

    if v_chat_status in ('waiting_operator', 'resolved', 'closed') then
        v_effective_status := 'ignored';
    else
        select cm.id
        into v_latest_client_message_id
        from public.chat_messages cm
        where cm.chat_id = v_run.chat_id
          and cm.sender_type = 'client'
        order by cm.created_at desc, cm.id desc
        limit 1;

        if v_latest_client_message_id is distinct from v_run.trigger_message_id then
            v_effective_status := 'obsolete';
        end if;
    end if;

    v_error_message := case
        when v_effective_status = 'failed' then left(coalesce(p_error_message, 'AI run failed'), 500)
        else null
    end;

    v_error_type := case
        when v_effective_status = 'failed' then coalesce(p_error_type, 'system')
        else null
    end;

    update public.chat_ai_runs
    set
        status = v_effective_status,
        error_message = v_error_message,
        error_type = v_error_type,
        completed_at = now()
    where id = v_run.id
      and status in ('pending', 'processing');

    return jsonb_build_object(
        'type', 'finished',
        'run_id', v_run.id,
        'status', v_effective_status
    );
end;
$$;

comment on column public.chat_ai_runs.processing_token is
    'Execution ownership token set when an AI run enters processing.';

comment on column public.chat_ai_runs.config_snapshot is
    'Backend config snapshot used for this AI run.';

comment on column public.chat_ai_runs.config_hash is
    'Stable hash/version for the config snapshot.';

comment on column public.chat_ai_runs.correlation_id is
    'Trace id passed through telegram-webhook, ai-orchestrator, and RPC calls.';

comment on column public.chat_ai_runs.error_type is
    'Safe error class for future retry and observability logic.';

comment on function public.start_chat_ai_run(uuid, uuid, text, text, jsonb, text) is
    'Creates a pending AI run if the trigger is the latest client message and no active run exists.';

comment on function public.mark_chat_ai_run_processing(uuid, text) is
    'Moves a pending AI run to processing and stores the execution owner token.';

comment on function public.finish_chat_ai_run(uuid, text, text, text, text) is
    'Finishes an AI run through a single terminal transition with owner and relevance checks.';
