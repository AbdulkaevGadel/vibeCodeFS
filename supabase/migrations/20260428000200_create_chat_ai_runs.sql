-- Phase 3: AI run execution/audit model.
-- Narrow schema change: no AI runtime, no LLM calls, no chat status changes.

alter table public.chat_messages
    add constraint chat_messages_chat_id_id_unique
        unique (chat_id, id);

create table public.chat_ai_runs (
    id uuid primary key default gen_random_uuid(),
    chat_id uuid not null references public.chats (id) on delete cascade,
    trigger_message_id uuid not null,
    response_message_id uuid references public.chat_messages (id) on delete set null,
    status text not null default 'pending',
    retrieval_status text not null default 'not_started',
    response_kind text not null default 'none',
    prompt_version text not null,
    top_similarity_score double precision,
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    started_at timestamptz,
    completed_at timestamptz,
    constraint chat_ai_runs_trigger_message_fk
        foreign key (chat_id, trigger_message_id)
        references public.chat_messages (chat_id, id)
        on delete cascade,
    constraint chat_ai_runs_status_check
        check (status in ('pending', 'processing', 'completed', 'failed', 'obsolete', 'ignored')),
    constraint chat_ai_runs_retrieval_status_check
        check (retrieval_status in ('not_started', 'hit', 'miss', 'failed')),
    constraint chat_ai_runs_response_kind_check
        check (response_kind in ('none', 'answer', 'clarify', 'handoff')),
    constraint chat_ai_runs_timestamps_check
        check (
            (
                status = 'pending'
                and started_at is null
                and completed_at is null
            )
            or
            (
                status = 'processing'
                and started_at is not null
                and completed_at is null
            )
            or
            (
                status = 'completed'
                and started_at is not null
                and completed_at is not null
            )
            or
            (
                status in ('failed', 'obsolete', 'ignored')
                and completed_at is not null
            )
        ),
    constraint chat_ai_runs_chat_trigger_message_unique
        unique (chat_id, trigger_message_id)
);

create unique index chat_ai_runs_one_active_per_chat
    on public.chat_ai_runs (chat_id)
    where status in ('pending', 'processing');

create index chat_ai_runs_chat_id_created_at_idx
    on public.chat_ai_runs (chat_id, created_at desc);

create index chat_ai_runs_trigger_message_id_idx
    on public.chat_ai_runs (trigger_message_id);

create index chat_ai_runs_response_message_id_idx
    on public.chat_ai_runs (response_message_id)
    where response_message_id is not null;

create function public.set_chat_ai_runs_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger set_chat_ai_runs_updated_at
before update on public.chat_ai_runs
for each row
execute function public.set_chat_ai_runs_updated_at();

comment on table public.chat_ai_runs is
    'Backend-owned execution/audit trail for AI runs. Visible conversation remains in chat_messages.';

comment on constraint chat_ai_runs_chat_trigger_message_unique on public.chat_ai_runs is
    'Idempotency: one AI run per chat trigger message.';

comment on index public.chat_ai_runs_one_active_per_chat is
    'Concurrency guard: one pending/processing AI run per chat.';
