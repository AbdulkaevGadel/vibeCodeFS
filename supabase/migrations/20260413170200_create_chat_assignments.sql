create table public.chat_assignments (
    chat_id uuid primary key references public.chats (id) on delete cascade,
    current_manager_id uuid not null references public.managers (id) on delete restrict,
    assigned_by_manager_id uuid references public.managers (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
