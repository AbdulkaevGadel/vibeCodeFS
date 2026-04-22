-- Restrict KB archive lifecycle to supervisor/admin and add hard delete for archived articles.

drop policy if exists "KB_SELECT_POLICY_FINAL" on public.knowledge_base_articles;

create policy "KB_SELECT_POLICY_FINAL" on public.knowledge_base_articles
    for select to authenticated
    using (
        (status = 'published')
        or (status = 'draft' and created_by_id = public.get_current_manager_id_safe_v1())
        or (public.is_admin_v1())
    );

create or replace function public.archive_kb_article_v1(p_id uuid, p_version int)
returns public.knowledge_base_articles
language plpgsql
security definer
set search_path = public
as $$
declare
    v_manager_role text;
begin
    select role into v_manager_role
    from public.managers
    where auth_user_id = auth.uid()
    limit 1;

    if v_manager_role is null then
        raise exception 'MANAGER_NOT_FOUND' using errcode = 'P0002';
    end if;

    if v_manager_role not in ('admin', 'supervisor') then
        raise exception 'KB_LIFECYCLE_FORBIDDEN' using errcode = 'P0001';
    end if;

    return public.update_kb_article_v1(
        p_id => p_id,
        p_status => 'archived'::public.article_status,
        p_version => p_version
    );
end;
$$;

create or replace function public.restore_kb_article_v1(p_id uuid, p_version int)
returns public.knowledge_base_articles
language plpgsql
security definer
set search_path = public
as $$
declare
    v_manager_role text;
begin
    select role into v_manager_role
    from public.managers
    where auth_user_id = auth.uid()
    limit 1;

    if v_manager_role is null then
        raise exception 'MANAGER_NOT_FOUND' using errcode = 'P0002';
    end if;

    if v_manager_role not in ('admin', 'supervisor') then
        raise exception 'KB_LIFECYCLE_FORBIDDEN' using errcode = 'P0001';
    end if;

    return public.update_kb_article_v1(
        p_id => p_id,
        p_status => 'published'::public.article_status,
        p_version => p_version
    );
end;
$$;

create or replace function public.delete_kb_article_v1(p_id uuid, p_version int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_manager_role text;
    v_article public.knowledge_base_articles;
begin
    select role into v_manager_role
    from public.managers
    where auth_user_id = auth.uid()
    limit 1;

    if v_manager_role is null then
        raise exception 'MANAGER_NOT_FOUND' using errcode = 'P0002';
    end if;

    if v_manager_role not in ('admin', 'supervisor') then
        raise exception 'KB_DELETE_FORBIDDEN' using errcode = 'P0001';
    end if;

    select * into v_article
    from public.knowledge_base_articles
    where id = p_id
    for update;

    if not found then
        raise exception 'ARTICLE_NOT_FOUND' using errcode = 'P0002';
    end if;

    if v_article.version is distinct from p_version then
        raise exception 'VERSION_CONFLICT_OR_FORBIDDEN' using errcode = 'P0001';
    end if;

    if v_article.status is distinct from 'archived'::public.article_status then
        raise exception 'KB_DELETE_REQUIRES_ARCHIVED' using errcode = 'P0001';
    end if;

    delete from public.knowledge_base_articles
    where id = p_id;

    return p_id;
end;
$$;

alter function public.archive_kb_article_v1(uuid, int) owner to postgres;
revoke all on function public.archive_kb_article_v1(uuid, int) from public;
grant execute on function public.archive_kb_article_v1(uuid, int) to authenticated;

alter function public.restore_kb_article_v1(uuid, int) owner to postgres;
revoke all on function public.restore_kb_article_v1(uuid, int) from public;
grant execute on function public.restore_kb_article_v1(uuid, int) to authenticated;

alter function public.delete_kb_article_v1(uuid, int) owner to postgres;
revoke all on function public.delete_kb_article_v1(uuid, int) from public;
grant execute on function public.delete_kb_article_v1(uuid, int) to authenticated;

