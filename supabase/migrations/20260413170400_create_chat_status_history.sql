create table public.chat_status_history (
    id uuid primary key default gen_random_uuid(),
    chat_id uuid not null references public.chats (id) on delete restrict,
    from_status varchar(32),
    to_status varchar(32) not null,
    changed_by_manager_id uuid references public.managers (id) on delete set null,
    created_at timestamptz not null default now(),
    constraint chat_status_history_from_status_check
        check (
            from_status is null
            or from_status in ('open', 'in_progress', 'escalated', 'resolved', 'closed')
        ),
    constraint chat_status_history_to_status_check
        check (to_status in ('open', 'in_progress', 'escalated', 'resolved', 'closed'))
);
