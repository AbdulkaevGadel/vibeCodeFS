-- 1. УСИЛЕНИЕ ВАЛИДАТОРА (Добавляем проверку sender_type)
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

    -- Валидируем только исходящие сообщения от МЕНЕДЖЕРА
    if new.delivery_status = 'pending' 
       and new.sender_type = 'manager' 
       and (v_internal_secret is null or v_internal_secret = '') 
    then
        new.delivery_status := 'failed';
        new.delivery_error := coalesce(new.delivery_error, '') || ' [System Hub] Missing internal_secret in public.system_settings table.';
    end if;

    return new;
end;
$$;

-- 2. УСИЛЕНИЕ ОТПРАВЩИКА (Фильтрация sender_type)
drop trigger if exists tr_message_deliver on public.chat_messages;
create trigger tr_message_deliver
after insert or update on public.chat_messages
for each row
when (
    new.delivery_status = 'pending' 
    and new.sender_type = 'manager' -- ВАЖНО: Только для сообщений от менеджера
)
execute function public.fn_invoke_message_delivery();

comment on trigger tr_message_deliver on public.chat_messages is 'Усиленный триггер отправки: только для менеджеров и только при смене статуса на pending';
