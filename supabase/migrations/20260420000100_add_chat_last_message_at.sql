-- Wave 14: Chat activity consistency
-- Adds backend-owned chat activity timestamp for deterministic support inbox ordering.

alter table public.chats
    add column if not exists last_message_at timestamptz;

update public.chats c
set last_message_at = latest.last_message_at
from (
    select
        chat_id,
        max(created_at) as last_message_at
    from public.chat_messages
    group by chat_id
) latest
where c.id = latest.chat_id
  and c.last_message_at is distinct from latest.last_message_at;

create index if not exists idx_chats_last_message_at
    on public.chats (last_message_at desc nulls last);

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
end $$;

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
    -- This RPC is called by the Edge Function with service_role, so auth.uid() is not used here.
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
        updated_at
    ) values (
        p_telegram_chat_id,
        v_client_id,
        p_bot_username,
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
    select role
    into v_manager_role
    from public.managers
    where auth_user_id = auth.uid();

    if v_manager_role != 'admin' then
        raise exception 'Only admin can delete messages';
    end if;

    select chat_id
    into v_chat_id
    from public.chat_messages
    where id = p_message_id;

    if v_chat_id is null then
        raise exception 'Message not found';
    end if;

    delete from public.chat_messages
    where id = p_message_id;

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
