create table public.assignment_history (
    id uuid primary key default gen_random_uuid(),
    chat_id uuid not null references public.chats (id) on delete restrict,
    from_manager_id uuid references public.managers (id) on delete set null,
    to_manager_id uuid not null references public.managers (id) on delete restrict,
    assigned_by_manager_id uuid references public.managers (id) on delete set null,
    created_at timestamptz not null default now()
);
