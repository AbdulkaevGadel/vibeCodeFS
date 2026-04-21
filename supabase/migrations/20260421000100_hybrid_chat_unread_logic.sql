-- Wave 16: Hybrid Unread & Preview Logic (Production Polish Version)
-- 
-- Goal: 
-- 1. Adds last_read_at to track support workflow state.
-- 2. Implements bulletproof RPCs (Security Definer, race condition protection, strictly guarded access).
-- 3. Optimizes performance with indexes.

-- 1. Schema update
alter table public.chats
    add column if not exists last_read_at timestamptz;

-- 2. Performance: optimization for unread counts and latest message queries
create index if not exists idx_chat_messages_chat_id_created_at
    on public.chat_messages (chat_id, created_at desc);

-- 3. Ensure Realtime is enabled for necessary tables
do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'chats'
    ) then
        alter publication supabase_realtime add table public.chats;
    end if;

    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'chat_messages'
    ) then
        alter publication supabase_realtime add table public.chat_messages;
    end if;
end $$;

-- 4. Update RPC: process_incoming_telegram_message
create or replace function public.process_incoming_telegram_message(
    p_telegram_user_id bigint,
    p_username varchar,
    p_first_name varchar,
    p_last_name varchar,
    p_telegram_chat_id bigint,
    p_bot_username varchar,
    p_telegram_message_id bigint,
    p_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_client_id uuid;
    v_chat_id uuid;
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
    returning created_at into v_message_created_at;

    if v_message_created_at is not null then
        update public.chats
        set
            last_message_at = v_message_created_at,
            updated_at = now()
        where id = v_chat_id;
    end if;
end;
$$;

-- 5. Update RPC: process_manager_outcoming_message
create or replace function public.process_manager_outcoming_message(
    p_chat_id uuid,
    p_text text,
    p_client_message_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_manager_id uuid;
    v_manager_role text;
    v_current_status text;
    v_tg_chat_id bigint;
    v_bot_username varchar;
    v_message_id uuid;
    v_message_created_at timestamptz;
    v_auth_id uuid;
begin
    if p_text is null or trim(p_text) = '' then
        raise exception 'Сообщение не может быть пустым';
    end if;

    if length(p_text) > 4000 then
        raise exception 'Сообщение слишком длинное';
    end if;

    if p_client_message_id is null then
        raise exception 'client_message_id обязателен для идемпотентности';
    end if;

    v_auth_id := auth.uid();
    select id, role
    into v_manager_id, v_manager_role
    from public.managers
    where auth_user_id = v_auth_id;

    if v_manager_id is null then
        raise exception 'Менеджер не найден';
    end if;

    select c.status, c.telegram_chat_id, c.bot_username
    into v_current_status, v_tg_chat_id, v_bot_username
    from public.chats c
    where c.id = p_chat_id
    for update;

    if v_tg_chat_id is null then
        raise exception 'Чат не найден';
    end if;

    if v_current_status in ('closed', 'resolved') then
        raise exception 'Чат закрыт или решен';
    end if;

    if v_manager_role = 'support' then
        if not exists (
            select 1
            from public.chat_assignments
            where chat_id = p_chat_id
              and current_manager_id = v_manager_id
        ) then
            raise exception 'Вы не назначены на этот чат';
        end if;

        if v_current_status = 'escalated' then
            raise exception 'Чат эскалирован';
        end if;
    end if;

    insert into public.chat_messages (
        chat_id,
        sender_type,
        manager_id,
        text,
        delivery_status,
        client_message_id,
        created_at
    ) values (
        p_chat_id,
        'manager',
        v_manager_id,
        p_text,
        'pending',
        p_client_message_id,
        now()
    )
    on conflict (client_message_id) do nothing
    returning id, created_at into v_message_id, v_message_created_at;

    if v_message_id is null then
        select id
        into v_message_id
        from public.chat_messages
        where client_message_id = p_client_message_id;

        return json_build_object(
            'message_id', v_message_id,
            'is_duplicate', true
        );
    end if;

    update public.chats
    set
        last_message_at = v_message_created_at,
        last_read_at = v_message_created_at,
        updated_at = now()
    where id = p_chat_id;

    return json_build_object(
        'message_id', v_message_id,
        'telegram_chat_id', v_tg_chat_id,
        'bot_username', v_bot_username,
        'text', p_text,
        'is_duplicate', false
    );
end;
$$;

-- 6. New RPC: mark_chat_as_read
create or replace function public.mark_chat_as_read(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_manager_id uuid;
    v_chat_exists boolean;
begin
    -- 1. Security: Verify manager credentials
    select id into v_manager_id
    from public.managers
    where auth_user_id = auth.uid();

    if v_manager_id is null then
        raise exception 'Unauthorized: Manager record not found';
    end if;

    -- 2. Guard: Verify chat existence and lock row
    select exists (
        select 1 
        from public.chats 
        where id = p_chat_id 
        for update
    ) into v_chat_exists;

    if not v_chat_exists then
        raise exception 'Chat not found';
    end if;

    -- 3. Logic: Update last_read_at with protection against stale data (race condition)
    update public.chats
    set
        last_read_at = greatest(
            coalesce(last_read_at, 'epoch'),
            coalesce((
                select max(created_at)
                from public.chat_messages
                where chat_id = p_chat_id
            ), 'epoch')
        ),
        updated_at = now()
    where id = p_chat_id;
end;
$$;

-- 7. Update RPC: delete_message
create or replace function public.delete_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_manager_role varchar;
    v_chat_id uuid;
    v_last_message_at timestamptz;
begin
    -- 1. Security check
    select role
    into v_manager_role
    from public.managers
    where auth_user_id = auth.uid();

    if v_manager_role != 'admin' then
        raise exception 'Only admin can delete messages';
    end if;

    -- 2. Determine chat_id and lock for update
    select chat_id
    into v_chat_id
    from public.chat_messages
    where id = p_message_id;

    if v_chat_id is null then
        raise exception 'Message not found';
    end if;

    -- Lock the chat row while we recalculate its metadata
    perform 1 from public.chats where id = v_chat_id for update;

    -- 3. Delete the message
    delete from public.chat_messages
    where id = p_message_id;

    -- 4. Recalculate last_message_at
    -- max() returns NULL if no messages left, which is exactly what we want.
    select max(created_at)
    into v_last_message_at
    from public.chat_messages
    where chat_id = v_chat_id;

    update public.chats
    set
        last_message_at = v_last_message_at,
        updated_at = now()
    where id = v_chat_id;
end;
$$;
