-- Phase 6: knowledge chunking schema and ingestion foundation.
-- No provider API calls, no runtime chunking, no vector retrieval.

create extension if not exists vector;

create table public.knowledge_chunk_sets (
    id uuid primary key default gen_random_uuid(),
    article_id uuid not null references public.knowledge_base_articles(id) on delete cascade,
    content_checksum text not null,
    embedding_provider text not null default 'huggingface',
    embedding_model text not null default 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
    embedding_dimension integer not null default 384,
    status text not null default 'pending',
    is_active boolean not null default false,
    chunk_count integer not null default 0,
    embedded_chunks_count integer not null default 0,
    attempt_count integer not null default 0,
    last_attempt_at timestamptz,
    processing_started_at timestamptz,
    completed_at timestamptz,
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint knowledge_chunk_sets_checksum_format_check
        check (content_checksum ~ '^[a-f0-9]{32}$'),
    constraint knowledge_chunk_sets_provider_not_blank
        check (btrim(embedding_provider) <> ''),
    constraint knowledge_chunk_sets_model_not_blank
        check (btrim(embedding_model) <> ''),
    constraint knowledge_chunk_sets_embedding_dimension_check
        check (embedding_dimension = 384),
    constraint knowledge_chunk_sets_status_check
        check (status in ('pending', 'processing', 'completed', 'failed')),
    constraint knowledge_chunk_sets_active_completed_check
        check ((is_active = true and status = 'completed') or is_active = false),
    constraint knowledge_chunk_sets_completed_at_check
        check (status <> 'completed' or completed_at is not null),
    constraint knowledge_chunk_sets_counts_check
        check (
            chunk_count >= 0
            and embedded_chunks_count >= 0
            and embedded_chunks_count <= chunk_count
            and attempt_count >= 0
        ),
    constraint knowledge_chunk_sets_error_message_length
        check (error_message is null or length(error_message) <= 1000),
    constraint knowledge_chunk_sets_article_checksum_unique
        unique (article_id, content_checksum)
);

create unique index knowledge_chunk_sets_one_active_per_article
    on public.knowledge_chunk_sets (article_id)
    where is_active = true;

create index knowledge_chunk_sets_ingestion_queue_idx
    on public.knowledge_chunk_sets (status, created_at, id)
    where status in ('pending', 'failed');

create index knowledge_chunk_sets_processing_started_idx
    on public.knowledge_chunk_sets (processing_started_at, id)
    where status = 'processing';

create index knowledge_chunk_sets_article_created_idx
    on public.knowledge_chunk_sets (article_id, created_at desc, id desc);

create table public.knowledge_chunks (
    id uuid primary key default gen_random_uuid(),
    chunk_set_id uuid not null,
    article_id uuid not null,
    chunk_index integer not null,
    chunk_text text not null,
    content_checksum text not null,
    embedding vector(384),
    embedding_status text not null default 'pending',
    embedding_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint knowledge_chunks_chunk_set_fk
        foreign key (chunk_set_id)
        references public.knowledge_chunk_sets(id)
        on delete cascade,
    constraint knowledge_chunks_article_fk
        foreign key (article_id)
        references public.knowledge_base_articles(id)
        on delete cascade,
    constraint knowledge_chunks_chunk_index_check
        check (chunk_index >= 0),
    constraint knowledge_chunks_text_not_blank
        check (btrim(chunk_text) <> ''),
    constraint knowledge_chunks_checksum_format_check
        check (content_checksum ~ '^[a-f0-9]{32}$'),
    constraint knowledge_chunks_embedding_status_check
        check (embedding_status in ('pending', 'processing', 'completed', 'failed')),
    constraint knowledge_chunks_completed_embedding_check
        check (embedding_status <> 'completed' or embedding is not null),
    constraint knowledge_chunks_embedding_error_length
        check (embedding_error is null or length(embedding_error) <= 1000),
    constraint knowledge_chunks_set_index_unique
        unique (chunk_set_id, chunk_index)
);

create index knowledge_chunks_article_set_idx
    on public.knowledge_chunks (article_id, chunk_set_id, chunk_index);

create index knowledge_chunks_retrieval_filter_idx
    on public.knowledge_chunks (article_id, embedding_status, chunk_index)
    where embedding_status = 'completed';

create function public.set_knowledge_chunk_sets_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger set_knowledge_chunk_sets_updated_at
before update on public.knowledge_chunk_sets
for each row
execute function public.set_knowledge_chunk_sets_updated_at();

create function public.set_knowledge_chunks_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger set_knowledge_chunks_updated_at
before update on public.knowledge_chunks
for each row
execute function public.set_knowledge_chunks_updated_at();

create function public.normalize_kb_content_for_ingestion(
    p_title text,
    p_content text
)
returns text
language sql
immutable
set search_path = public
as $$
    select btrim(
        regexp_replace(
            concat_ws(E'\n', coalesce(p_title, ''), coalesce(p_content, '')),
            '[[:space:]]+',
            ' ',
            'g'
        )
    );
$$;

create function public.calculate_kb_content_checksum(
    p_title text,
    p_content text
)
returns text
language sql
immutable
set search_path = public
as $$
    select md5(public.normalize_kb_content_for_ingestion(p_title, p_content));
$$;

create function public.ensure_kb_pending_chunk_set(
    p_article_id uuid,
    p_title text,
    p_content text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_checksum text;
    v_chunk_set_id uuid;
begin
    v_checksum := public.calculate_kb_content_checksum(p_title, p_content);

    insert into public.knowledge_chunk_sets (
        article_id,
        content_checksum,
        embedding_provider,
        embedding_model,
        embedding_dimension,
        status,
        is_active
    ) values (
        p_article_id,
        v_checksum,
        'huggingface',
        'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
        384,
        'pending',
        false
    )
    on conflict (article_id, content_checksum) do nothing
    returning id into v_chunk_set_id;

    if v_chunk_set_id is null then
        select id into v_chunk_set_id
        from public.knowledge_chunk_sets
        where article_id = p_article_id
          and content_checksum = v_checksum;
    end if;

    return v_chunk_set_id;
end;
$$;

alter function public.ensure_kb_pending_chunk_set(uuid, text, text) owner to postgres;
revoke all on function public.ensure_kb_pending_chunk_set(uuid, text, text) from public;

create or replace function public.create_kb_article_v1(
    p_title text,
    p_content text,
    p_slug text,
    p_status public.article_status default 'draft',
    p_source_chat_id uuid default null
)
returns public.knowledge_base_articles
language plpgsql
security definer
set search_path = public
as $$
declare
    v_manager_id uuid;
    v_final_slug text;
    v_result public.knowledge_base_articles;
begin
    v_manager_id := public.get_current_manager_id_v1();

    for i in 0..10 loop
        v_final_slug := lower(trim(p_slug)) || case when i = 0 then '' else '-' || i end;
        if not exists (select 1 from public.knowledge_base_articles where slug = v_final_slug) then
            exit;
        end if;
        if i = 10 then
            raise exception 'SLUG_GENERATION_FAILED' using errcode = 'P0003';
        end if;
    end loop;

    insert into public.knowledge_base_articles (
        title,
        content,
        slug,
        status,
        source_chat_id,
        created_by_id,
        updated_by_id,
        content_plain,
        content_tokens,
        archived_at,
        archived_by_id
    ) values (
        p_title,
        p_content,
        v_final_slug,
        p_status,
        p_source_chat_id,
        v_manager_id,
        v_manager_id,
        p_content,
        coalesce(length(p_content), 0) / 4,
        case when p_status = 'archived' then now() else null end,
        case when p_status = 'archived' then v_manager_id else null end
    )
    returning * into v_result;

    insert into public.knowledge_base_history (
        article_id,
        title,
        content,
        version,
        status,
        changed_by_id,
        change_type
    ) values (
        v_result.id,
        v_result.title,
        v_result.content,
        v_result.version,
        v_result.status,
        v_manager_id,
        'create'
    );

    if v_result.status <> 'archived'::public.article_status then
        perform public.ensure_kb_pending_chunk_set(v_result.id, v_result.title, v_result.content);
    end if;

    return v_result;
end;
$$;

create or replace function public.update_kb_article_v1(
    p_id uuid,
    p_title text default null,
    p_content text default null,
    p_slug text default null,
    p_status public.article_status default null,
    p_version int default null
)
returns public.knowledge_base_articles
language plpgsql
security definer
set search_path = public
as $$
declare
    v_manager_id uuid;
    v_final_slug text;
    v_result public.knowledge_base_articles;
    v_existing public.knowledge_base_articles;
    v_is_admin boolean;
    v_change_type public.kb_change_type := 'update';
    v_previous_checksum text;
    v_next_checksum text;
begin
    v_manager_id := public.get_current_manager_id_v1();
    v_is_admin := public.is_admin_v1();

    select *
    into v_existing
    from public.knowledge_base_articles
    where id = p_id;

    if not found then
        raise exception 'ARTICLE_NOT_FOUND' using errcode = 'P0002';
    end if;

    v_previous_checksum := public.calculate_kb_content_checksum(v_existing.title, v_existing.content);

    if p_slug is not null then
        for i in 0..10 loop
            v_final_slug := lower(trim(p_slug)) || case when i = 0 then '' else '-' || i end;
            if not exists (select 1 from public.knowledge_base_articles where slug = v_final_slug and id != p_id) then
                exit;
            end if;
        end loop;
    end if;

    update public.knowledge_base_articles
    set
        title = coalesce(p_title, title),
        content = coalesce(p_content, content),
        content_plain = coalesce(p_content, content),
        content_tokens = coalesce(length(coalesce(p_content, content)), 0) / 4,
        slug = coalesce(v_final_slug, slug),
        status = coalesce(p_status, status),
        updated_by_id = v_manager_id,
        version = version + 1,
        archived_at = case
            when coalesce(p_status, status) = 'archived' and archived_at is null then now()
            when coalesce(p_status, status) != 'archived' then null
            else archived_at
        end,
        archived_by_id = case
            when coalesce(p_status, status) = 'archived' and archived_by_id is null then v_manager_id
            when coalesce(p_status, status) != 'archived' then null
            else archived_by_id
        end,
        updated_at = now()
    where id = p_id
      and (p_version is null or version = p_version)
      and (created_by_id = v_manager_id or v_is_admin)
    returning * into v_result;

    if not found then
        raise exception 'VERSION_CONFLICT_OR_FORBIDDEN' using errcode = 'P0001';
    end if;

    if p_status is not null and p_title is null and p_content is null then
        if p_status = 'archived' then
            v_change_type := 'archive';
        elsif p_status = 'published' then
            v_change_type := 'publish';
        else
            v_change_type := 'update';
        end if;
    end if;

    insert into public.knowledge_base_history (
        article_id,
        title,
        content,
        version,
        status,
        changed_by_id,
        change_type
    ) values (
        v_result.id,
        v_result.title,
        v_result.content,
        v_result.version,
        v_result.status,
        v_manager_id,
        v_change_type
    );

    v_next_checksum := public.calculate_kb_content_checksum(v_result.title, v_result.content);

    if v_result.status <> 'archived'::public.article_status
       and (
           v_next_checksum is distinct from v_previous_checksum
           or not exists (
               select 1
               from public.knowledge_chunk_sets
               where article_id = v_result.id
                 and content_checksum = v_next_checksum
           )
       ) then
        perform public.ensure_kb_pending_chunk_set(v_result.id, v_result.title, v_result.content);
    end if;

    return v_result;
end;
$$;

alter function public.create_kb_article_v1(text, text, text, public.article_status, uuid) owner to postgres;
revoke all on function public.create_kb_article_v1(text, text, text, public.article_status, uuid) from public;
grant execute on function public.create_kb_article_v1(text, text, text, public.article_status, uuid) to authenticated;

alter function public.update_kb_article_v1(uuid, text, text, text, public.article_status, int) owner to postgres;
revoke all on function public.update_kb_article_v1(uuid, text, text, text, public.article_status, int) from public;
grant execute on function public.update_kb_article_v1(uuid, text, text, text, public.article_status, int) to authenticated;

alter table public.knowledge_chunk_sets enable row level security;
alter table public.knowledge_chunks enable row level security;

revoke all on public.knowledge_chunk_sets from anon, authenticated, public;
revoke all on public.knowledge_chunks from anon, authenticated, public;

comment on table public.knowledge_chunk_sets is
    'Versioned ingestion state for Knowledge Base article chunks. One active completed set per article.';

comment on table public.knowledge_chunks is
    'Chunk-level retrieval records for Knowledge Base articles. Embeddings are generated asynchronously.';

comment on function public.ensure_kb_pending_chunk_set(uuid, text, text) is
    'Creates or reuses a pending Knowledge Base chunk set for the canonical title/content checksum.';
