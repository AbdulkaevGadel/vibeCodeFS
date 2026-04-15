-- 1. Подготовка окружения
create extension if not exists pg_net;

-- 2. Таблица настроек (если еще нет)
create table if not exists public.system_settings (
    key text primary key,
    value text
);

-- 3. ВАЛИДАТОР (BEFORE INSERT OR UPDATE)
create or replace function public.fn_validate_message_delivery()
returns trigger
language plpgsql
security definer
as $$
declare
    v_internal_secret text;
begin
    -- Достаем секрет из таблицы настроек
    select value into v_internal_secret 
    from public.system_settings 
    where key = 'internal_secret';

    if new.delivery_status = 'pending' and (v_internal_secret is null or v_internal_secret = '') then
        new.delivery_status := 'failed';
        new.delivery_error := coalesce(new.delivery_error, '') || ' [System Hub] Missing internal_secret in public.system_settings table.';
    end if;

    return new;
end;
$$;

-- 4. ОТПРАВЩИК (AFTER INSERT OR UPDATE)
create or replace function public.fn_invoke_message_delivery()
returns trigger
language plpgsql
security definer
as $$
declare
    v_telegram_chat_id bigint;
    v_internal_secret text;
begin
    -- Защита от двойного срабатывания (Double Firing Protection)
    if (tg_op = 'UPDATE' and old.delivery_status = 'pending' and new.delivery_status = 'pending') then
        return new;
    end if;

    -- Достаем секрет из таблицы настроек
    select value into v_internal_secret 
    from public.system_settings 
    where key = 'internal_secret';

    -- Находим ID чата
    select telegram_chat_id into v_telegram_chat_id
    from public.chats
    where id = new.chat_id;

    if v_telegram_chat_id is not null then
        perform net.http_post(
            url := 'https://cpmnfkszgsxdouxidpzv.supabase.co/functions/v1/telegram-outcoming',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'x-internal-secret', v_internal_secret
            ),
            body := jsonb_build_object(
                'message_id', new.id,
                'telegram_chat_id', v_telegram_chat_id,
                'text', new.text,
                'is_duplicate', false,
                'metadata', jsonb_build_object(
                    'source', 'db_trigger',
                    'triggered_at', now()
                )
            )
        );
    end if;

    return new;
end;
$$;

-- 5. РЕГИСТРАЦИЯ ТРИГГЕРОВ
drop trigger if exists tr_message_validate on public.chat_messages;
create trigger tr_message_validate
before insert or update of delivery_status on public.chat_messages
for each row
execute function public.fn_validate_message_delivery();

drop trigger if exists tr_message_deliver on public.chat_messages;
create trigger tr_message_deliver
after insert or update on public.chat_messages
for each row
when (
    new.delivery_status = 'pending' 
    and new.sender_type = 'manager'
)
execute function public.fn_invoke_message_delivery();
