-- Format manager-visible prefixes in the backend message boundary.
-- Existing migrations are already applied, so this incremental migration replaces
-- the RPC without editing historical migration files.

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
    v_manager_display_name text;
    v_manager_last_name text;
    v_manager_email text;
    v_manager_label text;
    v_is_first_manager_message boolean;
    v_formatted_text text;
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
    select id, role, display_name, last_name, email
    into v_manager_id, v_manager_role, v_manager_display_name, v_manager_last_name, v_manager_email
    from public.managers
    where auth_user_id = v_auth_id;

    if v_manager_id is null then
        raise exception 'Менеджер не найден';
    end if;

    v_manager_label := nullif(
        trim(concat_ws(' ', nullif(v_manager_display_name, ''), nullif(v_manager_last_name, ''))),
        ''
    );
    v_manager_label := coalesce(v_manager_label, nullif(trim(v_manager_email), ''), 'Менеджер');

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

    v_is_first_manager_message := not exists (
        select 1
        from public.chat_messages
        where chat_id = p_chat_id
          and sender_type = 'manager'
          and manager_id = v_manager_id
        limit 1
    );

    if v_is_first_manager_message then
        v_formatted_text := format(
            'На связи %s, оператор службы поддержки.%s%s',
            v_manager_label,
            chr(10),
            p_text
        );
    else
        v_formatted_text := format('%s:%s%s', v_manager_label, chr(10), p_text);
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
        v_formatted_text,
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
        'text', v_formatted_text,
        'is_duplicate', false
    );
end;
$$;
