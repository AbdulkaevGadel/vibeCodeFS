create table public.chats (
    id uuid primary key default gen_random_uuid(),
    telegram_chat_id bigint not null,
    client_id uuid not null references public.clients (id) on delete restrict,
    bot_username varchar(64) not null,
    status varchar(32) not null,
    subject varchar(255),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint chats_status_check
        check (status in ('open', 'in_progress', 'escalated', 'resolved', 'closed')),
    constraint chats_telegram_chat_id_bot_username_key
        unique (telegram_chat_id, bot_username)
);
