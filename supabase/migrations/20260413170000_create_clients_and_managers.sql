create table public.clients (
    id uuid primary key default gen_random_uuid(),
    telegram_user_id bigint not null unique,
    username varchar(32),
    first_name varchar(255),
    last_name varchar(255),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.managers (
    id uuid primary key default gen_random_uuid(),
    auth_user_id uuid not null unique references auth.users (id) on delete restrict,
    email varchar(255),
    display_name varchar(255),
    role varchar(32) not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint managers_role_check
        check (role in ('admin', 'support', 'supervisor'))
);
