-- Wave 7: Security Hardening
-- Глобальное включение RLS и создание защищенных политик для домена поддержки

-- 1. Включаем RLS на всех таблицах домена
alter table public.clients enable row level security;
alter table public.managers enable row level security;
alter table public.chats enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_assignments enable row level security;
alter table public.assignment_history enable row level security;
alter table public.chat_status_history enable row level security;

-- 2. Создаем базовые политики SELECT для всех авторизованных менеджеров
create policy "Managers can view all clients" on public.clients
    for select to authenticated using (true);

create policy "Managers can view all managers" on public.managers
    for select to authenticated using (true);

create policy "Managers can view all chats" on public.chats
    for select to authenticated using (true);

create policy "Managers can view all chat messages" on public.chat_messages
    for select to authenticated using (true);

create policy "Managers can view all chat assignments" on public.chat_assignments
    for select to authenticated using (true);

create policy "Managers can view all assignment history" on public.assignment_history
    for select to authenticated using (true);

create policy "Managers can view all status history" on public.chat_status_history
    for select to authenticated using (true);

-- 3. Прямые INSERT/UPDATE/DELETE запрещены (RLS без политик на запись)

-- 4. RPC: take_chat_into_work (исправленная версия)
create or replace function public.take_chat_into_work(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
v_auth_id uuid;
    v_manager_id uuid;
    v_manager_role varchar;
    v_current_status varchar;
    v_current_manager_id uuid;
begin
    -- 1. Идентификация
    v_auth_id := auth.uid();
    if v_auth_id is null then
        raise exception 'Аутентификация обязательна';
end if;

    -- 2. Поиск менеджера
select id, role
into v_manager_id, v_manager_role
from public.managers
where auth_user_id = v_auth_id;

if v_manager_id is null then
        raise exception 'Запись менеджера не найдена для данного пользователя';
end if;

    -- 3. Блокировка чата
select status
into v_current_status
from public.chats
where id = p_chat_id
    for update;

if not found then
        raise exception 'Чат не найден';
end if;

    -- 4. Escalated guard
    if v_current_status = 'escalated' and v_manager_role = 'support' then
        raise exception 'У вас недостаточно прав для изменения чата в статусе escalated';
end if;

    -- 5. Блокируем assignment
select current_manager_id
into v_current_manager_id
from public.chat_assignments
where chat_id = p_chat_id
    for update;

-- 6. Assignment (только если другой менеджер)
if v_current_manager_id is distinct from v_manager_id then

        insert into public.assignment_history (
            chat_id,
            from_manager_id,
            to_manager_id,
            assigned_by_manager_id
        ) values (
            p_chat_id,
            v_current_manager_id,
            v_manager_id,
            v_manager_id
        );

insert into public.chat_assignments (
    chat_id,
    current_manager_id,
    assigned_by_manager_id,
    updated_at
) values (
             p_chat_id,
             v_manager_id,
             v_manager_id,
             now()
         )
    on conflict (chat_id) do update
                                 set
                                     current_manager_id = excluded.current_manager_id,
                                 assigned_by_manager_id = excluded.assigned_by_manager_id,
                                 updated_at = now();

end if;

    -- 7. Status workflow
    if v_current_status = 'open' then

        insert into public.chat_status_history (
            chat_id,
            from_status,
            to_status,
            changed_by_manager_id
        ) values (
            p_chat_id,
            v_current_status,
            'in_progress',
            v_manager_id
        );

update public.chats
set
    status = 'in_progress',
    updated_at = now()
where id = p_chat_id;

end if;

end;
$$;