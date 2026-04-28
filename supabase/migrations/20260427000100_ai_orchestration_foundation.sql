-- Wave 18: AI orchestration foundation schema
-- Purpose:
-- 1. Extend chat_messages actor model for AI/system messages.
-- 2. Add waiting_operator status to chats and chat_status_history.
-- 3. Introduce chat_ai_runs as execution/audit layer for AI orchestration.

alter table public.chat_messages
    drop constraint if exists chat_messages_sender_type_check;

alter table public.chat_messages
    add constraint chat_messages_sender_type_check
        check (sender_type in ('client', 'manager', 'ai', 'system'));

alter table public.chat_messages
    drop constraint if exists chat_messages_sender_manager_consistency_check;

alter table public.chat_messages
    add constraint chat_messages_sender_manager_consistency_check
        check (
            (sender_type = 'manager' and manager_id is not null)
            or
            (sender_type <> 'manager' and manager_id is null)
        );

alter table public.chats
    drop constraint if exists chats_status_check;

alter table public.chats
    add constraint chats_status_check
        check (status in ('open', 'in_progress', 'escalated', 'waiting_operator', 'resolved', 'closed'));

alter table public.chat_status_history
    drop constraint if exists chat_status_history_from_status_check;

alter table public.chat_status_history
    add constraint chat_status_history_from_status_check
        check (
            from_status is null
            or from_status in ('open', 'in_progress', 'escalated', 'waiting_operator', 'resolved', 'closed')
        );

alter table public.chat_status_history
    drop constraint if exists chat_status_history_to_status_check;

alter table public.chat_status_history
    add constraint chat_status_history_to_status_check
        check (to_status in ('open', 'in_progress', 'escalated', 'waiting_operator', 'resolved', 'closed'));

create table public.chat_ai_runs (
    id uuid primary key default gen_random_uuid(),
    chat_id uuid not null references public.chats(id) on delete cascade,
    trigger_message_id uuid references public.chat_messages(id) on delete set null,
    response_message_id uuid references public.chat_messages(id) on delete set null,
    retrieval_status varchar(32),
    response_kind varchar(32),
    status varchar(32) not null,
    prompt_version varchar(64),
    config_snapshot jsonb,
    top_similarity_score numeric(6, 5),
    matched_chunks_count integer,
    error_message text,
    created_at timestamptz not null default now(),
    started_at timestamptz,
    completed_at timestamptz,
    constraint chat_ai_runs_status_check
        check (status in ('pending', 'processing', 'completed', 'failed', 'obsolete', 'ignored')),
    constraint chat_ai_runs_retrieval_status_check
        check (
            retrieval_status is null
            or retrieval_status in ('hit', 'miss', 'error')
        ),
    constraint chat_ai_runs_response_kind_check
        check (
            response_kind is null
            or response_kind in ('answer', 'clarify', 'handoff', 'error')
        ),
    constraint chat_ai_runs_prompt_version_not_blank
        check (prompt_version is null or length(trim(prompt_version)) > 0),
    constraint chat_ai_runs_non_negative_matched_chunks
        check (matched_chunks_count is null or matched_chunks_count >= 0)
);

create unique index chat_ai_runs_chat_id_trigger_message_id_uidx
    on public.chat_ai_runs (chat_id, trigger_message_id)
    where trigger_message_id is not null;

create unique index chat_ai_runs_one_active_per_chat_uidx
    on public.chat_ai_runs (chat_id)
    where status in ('pending', 'processing');

create index chat_ai_runs_chat_id_created_at_idx
    on public.chat_ai_runs (chat_id, created_at desc);

create index chat_ai_runs_status_created_at_idx
    on public.chat_ai_runs (status, created_at desc);

comment on table public.chat_ai_runs is 'Execution and audit trail for backend AI orchestration.';
comment on column public.chat_ai_runs.config_snapshot is 'One-run config snapshot used by orchestrator for reproducibility.';

create or replace function public.take_chat_into_work(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_auth_id uuid;
    v_manager_id uuid;
    v_manager_role varchar;
    v_current_status varchar;
    v_current_manager_id uuid;
    v_current_manager_name text;
begin
    v_auth_id := auth.uid();
    if v_auth_id is null then
        raise exception 'Аутентификация обязательна';
    end if;

    select id, role
    into v_manager_id, v_manager_role
    from public.managers
    where auth_user_id = v_auth_id;

    if v_manager_id is null then
        raise exception 'Запись менеджера не найдена';
    end if;

    select status
    into v_current_status
    from public.chats
    where id = p_chat_id
    for update;

    if not found then
        raise exception 'Чат не найден';
    end if;

    if v_current_status = 'escalated' and v_manager_role = 'support' then
        raise exception 'У вас недостаточно прав для изменения чата в статусе escalated';
    end if;

    select ca.current_manager_id
    into v_current_manager_id
    from public.chat_assignments ca
    where ca.chat_id = p_chat_id
    for update;

    if v_current_manager_id is not null then
        select m.display_name
        into v_current_manager_name
        from public.managers m
        where m.id = v_current_manager_id;
    end if;

    if v_current_manager_id is not null and v_current_manager_id != v_manager_id then
        raise exception 'Чат уже занят менеджером %', coalesce(v_current_manager_name, 'другим сотрудником');
    end if;

    if v_current_manager_id is null or v_current_manager_id != v_manager_id then
        insert into public.assignment_history (
            chat_id,
            from_manager_id,
            to_manager_id,
            assigned_by_manager_id
        ) values (
            p_chat_id,
            v_current_manager_id,
            v_manager_id,
            v_manager_id
        );

        insert into public.chat_assignments (
            chat_id,
            current_manager_id,
            assigned_by_manager_id,
            updated_at
        ) values (
            p_chat_id,
            v_manager_id,
            v_manager_id,
            now()
        )
        on conflict (chat_id) do update
        set
            current_manager_id = excluded.current_manager_id,
            assigned_by_manager_id = excluded.assigned_by_manager_id,
            updated_at = now();
    end if;

    if v_current_status in ('open', 'waiting_operator') then
        insert into public.chat_status_history (
            chat_id,
            from_status,
            to_status,
            changed_by_manager_id
        ) values (
            p_chat_id,
            v_current_status,
            'in_progress',
            v_manager_id
        );
    end if;

    update public.chats
    set
        status = case when status in ('open', 'waiting_operator') then 'in_progress' else status end,
        updated_at = now()
    where id = p_chat_id;
end;
$$;
