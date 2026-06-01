-- Add authenticated RPC boundary for manager account workflow mutations.

create or replace function public.create_manager_account_row_v1(
    p_auth_user_id uuid,
    p_email text,
    p_display_name text,
    p_last_name text,
    p_role text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_current_manager_role text;
    v_manager_id uuid;
begin
    select role
    into v_current_manager_role
    from public.managers
    where auth_user_id = auth.uid()
    limit 1;

    if v_current_manager_role is null then
        raise exception 'MANAGER_NOT_FOUND' using errcode = 'P0002';
    end if;

    if v_current_manager_role is distinct from 'admin' then
        raise exception 'MANAGER_WORKFLOW_FORBIDDEN' using errcode = 'P0001';
    end if;

    if p_auth_user_id is null then
        raise exception 'MANAGER_AUTH_USER_ID_REQUIRED' using errcode = 'P0001';
    end if;

    if nullif(trim(p_email), '') is null then
        raise exception 'MANAGER_EMAIL_REQUIRED' using errcode = 'P0001';
    end if;

    if nullif(trim(p_display_name), '') is null then
        raise exception 'MANAGER_DISPLAY_NAME_REQUIRED' using errcode = 'P0001';
    end if;

    if p_role is null or p_role not in ('admin', 'support', 'supervisor') then
        raise exception 'MANAGER_ROLE_INVALID' using errcode = 'P0001';
    end if;

    insert into public.managers (
        auth_user_id,
        email,
        display_name,
        last_name,
        role
    ) values (
        p_auth_user_id,
        lower(trim(p_email)),
        trim(p_display_name),
        nullif(trim(p_last_name), ''),
        p_role
    )
    returning id into v_manager_id;

    return v_manager_id;
end;
$$;

alter function public.create_manager_account_row_v1(uuid, text, text, text, text) owner to postgres;
revoke all on function public.create_manager_account_row_v1(uuid, text, text, text, text) from public;
revoke all on function public.create_manager_account_row_v1(uuid, text, text, text, text) from anon;
grant execute on function public.create_manager_account_row_v1(uuid, text, text, text, text) to authenticated;

create or replace function public.update_manager_profile_v1(
    p_manager_id uuid,
    p_display_name text,
    p_last_name text,
    p_role text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_current_manager_role text;
    v_updated_manager_id uuid;
begin
    select role
    into v_current_manager_role
    from public.managers
    where auth_user_id = auth.uid()
    limit 1;

    if v_current_manager_role is null then
        raise exception 'MANAGER_NOT_FOUND' using errcode = 'P0002';
    end if;

    if v_current_manager_role is distinct from 'admin' then
        raise exception 'MANAGER_WORKFLOW_FORBIDDEN' using errcode = 'P0001';
    end if;

    if p_manager_id is null then
        raise exception 'MANAGER_ID_REQUIRED' using errcode = 'P0001';
    end if;

    if nullif(trim(p_display_name), '') is null then
        raise exception 'MANAGER_DISPLAY_NAME_REQUIRED' using errcode = 'P0001';
    end if;

    if p_role is null or p_role not in ('admin', 'support', 'supervisor') then
        raise exception 'MANAGER_ROLE_INVALID' using errcode = 'P0001';
    end if;

    update public.managers
    set
        display_name = trim(p_display_name),
        last_name = nullif(trim(p_last_name), ''),
        role = p_role,
        updated_at = now()
    where id = p_manager_id
    returning id into v_updated_manager_id;

    if v_updated_manager_id is null then
        raise exception 'MANAGER_NOT_FOUND' using errcode = 'P0002';
    end if;

    return v_updated_manager_id;
end;
$$;

alter function public.update_manager_profile_v1(uuid, text, text, text) owner to postgres;
revoke all on function public.update_manager_profile_v1(uuid, text, text, text) from public;
revoke all on function public.update_manager_profile_v1(uuid, text, text, text) from anon;
grant execute on function public.update_manager_profile_v1(uuid, text, text, text) to authenticated;

create or replace function public.manager_auth_user_link_exists_v1(
    p_auth_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_current_manager_role text;
begin
    select role
    into v_current_manager_role
    from public.managers
    where auth_user_id = auth.uid()
    limit 1;

    if v_current_manager_role is null then
        raise exception 'MANAGER_NOT_FOUND' using errcode = 'P0002';
    end if;

    if v_current_manager_role is distinct from 'admin' then
        raise exception 'MANAGER_WORKFLOW_FORBIDDEN' using errcode = 'P0001';
    end if;

    if p_auth_user_id is null then
        raise exception 'MANAGER_AUTH_USER_ID_REQUIRED' using errcode = 'P0001';
    end if;

    return exists (
        select 1
        from public.managers
        where auth_user_id = p_auth_user_id
    );
end;
$$;

alter function public.manager_auth_user_link_exists_v1(uuid) owner to postgres;
revoke all on function public.manager_auth_user_link_exists_v1(uuid) from public;
revoke all on function public.manager_auth_user_link_exists_v1(uuid) from anon;
grant execute on function public.manager_auth_user_link_exists_v1(uuid) to authenticated;
