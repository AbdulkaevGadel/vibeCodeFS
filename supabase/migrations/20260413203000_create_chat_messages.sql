create table public.chat_messages (
    id uuid primary key default gen_random_uuid(),
    chat_id uuid not null references public.chats (id) on delete restrict,
    sender_type varchar(32) not null,
    manager_id uuid references public.managers (id) on delete restrict,
    text text not null,
    telegram_message_id bigint,
    legacy_message_id bigint,
    created_at timestamptz not null default now(),
    constraint chat_messages_sender_type_check
        check (sender_type in ('client', 'manager')),
    constraint chat_messages_sender_manager_consistency_check
        check (
            (sender_type = 'manager' and manager_id is not null)
            or
            (sender_type = 'client' and manager_id is null)
        )
);

create index chat_messages_chat_id_created_at_idx
    on public.chat_messages (chat_id, created_at);

create unique index chat_messages_legacy_message_id_unique_idx
    on public.chat_messages (legacy_message_id)
    where legacy_message_id is not null;
