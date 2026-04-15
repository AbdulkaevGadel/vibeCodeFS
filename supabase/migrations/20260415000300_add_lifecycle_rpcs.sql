-- Wave 11: Lifecycle Management (Resolve & Transfer)

-- 1. RPC: Завершение чата (Resolve Chat)
create or replace function public.resolve_chat(p_chat_id uuid)
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
begin
    -- 1. Идентификация
    v_auth_id := auth.uid();
    if v_auth_id is null then raise exception 'Аутентификация обязательна'; end if;

    select id, role into v_manager_id, v_manager_role from public.managers where auth_user_id = v_auth_id;
    if v_manager_id is null then raise exception 'Менеджер не найден'; end if;

    -- 2. Проверка чата
    select status into v_current_status from public.chats where id = p_chat_id for update;
    if not found then raise exception 'Чат не найден'; end if;

    if v_current_status in ('closed', 'resolved') then
        raise exception 'Чат уже завершен';
    end if;

    -- 3. Проверка прав (разрешить только назначенному или админу/супервайзеру)
    if v_manager_role = 'support' then
        if not exists (select 1 from public.chat_assignments where chat_id = p_chat_id and current_manager_id = v_manager_id) then
            raise exception 'Вы не назначены на этот чат, завершить его не может';
        end if;
    end if;

    -- 4. Смена статуса
    insert into public.chat_status_history (
        chat_id, from_status, to_status, changed_by_manager_id
    ) values (
        p_chat_id, v_current_status, 'resolved', v_manager_id
    );

    update public.chats 
    set status = 'resolved', updated_at = now() 
    where id = p_chat_id;
end;
$$;

-- 2. RPC: Передача чата (Transfer Chat)
create or replace function public.transfer_chat(
    p_chat_id uuid,
    p_target_manager_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_auth_id uuid;
    v_from_manager_id uuid;
    v_current_manager_id uuid;
    v_manager_role varchar;
begin
    -- 1. Идентификация отправителя
    v_auth_id := auth.uid();
    select id, role into v_from_manager_id, v_manager_role from public.managers where auth_user_id = v_auth_id;
    if v_from_manager_id is null then raise exception 'Менеджер не найден'; end if;

    -- 2. Проверка прав на трансфер
    -- (Support может передавать только СВОИ чаты, Admin/Supervisor - любые)
    select current_manager_id into v_current_manager_id 
    from public.chat_assignments where chat_id = p_chat_id for update;

    if v_manager_role = 'support' and v_current_manager_id is distinct from v_from_manager_id then
        raise exception 'Вы можете передавать только те чаты, на которые назначены сами';
    end if;

    -- 3. Проверка существования целевого менеджера
    if not exists (select 1 from public.managers where id = p_target_manager_id) then
        raise exception 'Целевой менеджер не найден';
    end if;

    -- 4. Запись истории назначения
    insert into public.assignment_history (
        chat_id, from_manager_id, to_manager_id, assigned_by_manager_id
    ) values (
        p_chat_id, v_current_manager_id, p_target_manager_id, v_from_manager_id
    );

    -- 5. Обновление текущего назначения
    insert into public.chat_assignments (
        chat_id, current_manager_id, assigned_by_manager_id, updated_at
    ) values (
        p_chat_id, p_target_manager_id, v_from_manager_id, now()
    )
    on conflict (chat_id) do update 
    set 
        current_manager_id = excluded.current_manager_id,
        assigned_by_manager_id = excluded.assigned_by_manager_id,
        updated_at = now();

    -- 6. Перевод чата в in_progress, если он был open
    update public.chats 
    set status = 'in_progress', updated_at = now() 
    where id = p_chat_id and status = 'open';

end;
$$;

comment on function public.resolve_chat is 'Завершает диалог, устанавливая статус resolved';
comment on function public.transfer_chat is 'Передает чат от одного менеджера другому';
