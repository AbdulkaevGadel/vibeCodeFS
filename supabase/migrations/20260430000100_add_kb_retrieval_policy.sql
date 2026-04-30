-- Phase 8: Knowledge Base retrieval policy.
-- Backend-only vector retrieval, strict policy RPC, and retrieval result persistence.

alter table public.chat_ai_runs
    add column if not exists retrieval_chunks jsonb,
    add column if not exists matched_chunks_count integer;

alter table public.chat_ai_runs
    drop constraint if exists chat_ai_runs_retrieval_status_check,
    drop constraint if exists chat_ai_runs_retrieval_chunks_check,
    drop constraint if exists chat_ai_runs_matched_chunks_count_check;

alter table public.chat_ai_runs
    add constraint chat_ai_runs_retrieval_status_check
        check (retrieval_status in ('not_started', 'hit', 'miss', 'empty', 'failed')),
    add constraint chat_ai_runs_retrieval_chunks_check
        check (retrieval_chunks is null or jsonb_typeof(retrieval_chunks) = 'array'),
    add constraint chat_ai_runs_matched_chunks_count_check
        check (matched_chunks_count is null or matched_chunks_count >= 0);

create index if not exists knowledge_chunks_embedding_cosine_idx
    on public.knowledge_chunks
    using ivfflat (embedding vector_cosine_ops)
    with (lists = 100)
    where embedding_status = 'completed'
      and embedding is not null;
-- Manual post-apply DB maintenance: run ANALYZE public.knowledge_chunks
-- so the planner can use fresh statistics for the ivfflat index.

create or replace function public.match_knowledge_chunks_v1(
    p_query_embedding vector(384),
    p_match_threshold double precision,
    p_match_count integer,
    p_candidate_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_top_similarity_score double precision;
    v_chunks jsonb;
    v_matched_chunks_count integer;
begin
    if p_query_embedding is null
       or vector_dims(p_query_embedding) <> 384
       or p_match_threshold is null
       or p_match_threshold < 0
       or p_match_threshold > 1
       or p_match_count is null
       or p_match_count <= 0
       or p_match_count > 20
       or p_candidate_count is null
       or p_candidate_count <= 0
       or p_candidate_count > 200
       or p_candidate_count < p_match_count
       or p_candidate_count < p_match_count * 5 then
        return jsonb_build_object(
            'retrieval_status', 'failed',
            'error_type', 'validation',
            'error_message', 'INVALID_RETRIEVAL_REQUEST',
            'top_similarity_score', null,
            'matched_chunks_count', 0,
            'chunks', '[]'::jsonb
        );
    end if;

    with candidates as (
        select
            kc.id as chunk_id,
            kc.article_id,
            kc.chunk_index,
            1 - (kc.embedding <=> p_query_embedding) as similarity_score
        from public.knowledge_chunks kc
        join public.knowledge_chunk_sets kcs on kcs.id = kc.chunk_set_id
        join public.knowledge_base_articles article on article.id = kc.article_id
        where kcs.is_active = true
          and kcs.status = 'completed'
          and kc.embedding_status = 'completed'
          and kc.embedding is not null
          and article.status = 'published'::public.article_status
        order by kc.embedding <=> p_query_embedding
        limit p_candidate_count
    ),
    top_score as (
        select max(similarity_score) as score
        from candidates
    ),
    matched as (
        select *
        from candidates
        where similarity_score >= p_match_threshold
        order by similarity_score desc, chunk_id
        limit p_match_count
    ),
    matched_summary as (
        select
            coalesce(
                jsonb_agg(
                    jsonb_build_object(
                        'chunk_id', matched.chunk_id,
                        'article_id', matched.article_id,
                        'chunk_index', matched.chunk_index,
                        'similarity_score', matched.similarity_score
                    )
                    order by matched.similarity_score desc, matched.chunk_id
                ),
                '[]'::jsonb
            ) as chunks,
            count(*) as matched_count
        from matched
    )
    select
        top_score.score,
        matched_summary.chunks,
        matched_summary.matched_count
    into v_top_similarity_score, v_chunks, v_matched_chunks_count
    from top_score
    cross join matched_summary;

    if v_top_similarity_score is null then
        return jsonb_build_object(
            'retrieval_status', 'empty',
            'top_similarity_score', null,
            'matched_chunks_count', 0,
            'chunks', '[]'::jsonb
        );
    end if;

    if v_matched_chunks_count > 0 then
        return jsonb_build_object(
            'retrieval_status', 'hit',
            'top_similarity_score', v_top_similarity_score,
            'matched_chunks_count', v_matched_chunks_count,
            'chunks', v_chunks
        );
    end if;

    return jsonb_build_object(
        'retrieval_status', 'miss',
        'top_similarity_score', v_top_similarity_score,
        'matched_chunks_count', 0,
        'chunks', '[]'::jsonb
    );
exception
    when others then
        return jsonb_build_object(
            'retrieval_status', 'failed',
            'error_type', 'system',
            'error_message', 'RETRIEVAL_RPC_FAILED',
            'top_similarity_score', null,
            'matched_chunks_count', 0,
            'chunks', '[]'::jsonb
        );
end;
$$;

create or replace function public.save_chat_ai_retrieval_result(
    p_run_id uuid,
    p_processing_token text,
    p_retrieval_status text,
    p_top_similarity_score double precision,
    p_matched_chunks_count integer,
    p_retrieval_chunks jsonb,
    p_error_message text default null,
    p_error_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_run public.chat_ai_runs;
    v_chat_status text;
    v_latest_client_message_id uuid;
    v_chunks_length integer;
    v_malformed_count integer;
    chunk_item jsonb;
    v_chunk_index_text text;
    v_similarity_score double precision;
    v_similarity_score_text text;
begin
    if p_run_id is null
       or p_processing_token is null
       or btrim(p_processing_token) = ''
       or p_retrieval_status not in ('hit', 'miss', 'empty', 'failed')
       or p_matched_chunks_count is null
       or p_matched_chunks_count < 0
       or p_matched_chunks_count > 20
       or p_retrieval_chunks is null
       or jsonb_typeof(p_retrieval_chunks) <> 'array'
       or (p_error_type is not null and p_error_type not in ('validation', 'system', 'external')) then
        return jsonb_build_object('type', 'invalid_request', 'run_id', p_run_id);
    end if;

    v_chunks_length := jsonb_array_length(p_retrieval_chunks);

    if v_chunks_length <> p_matched_chunks_count
       or v_chunks_length > 20
       or (p_retrieval_status = 'hit' and (p_matched_chunks_count = 0 or v_chunks_length = 0))
       or (p_retrieval_status in ('miss', 'empty') and (p_matched_chunks_count <> 0 or v_chunks_length <> 0))
       or (p_retrieval_status = 'failed' and (p_matched_chunks_count <> 0 or v_chunks_length <> 0))
       or (p_retrieval_status = 'empty' and p_top_similarity_score is not null)
       or (p_retrieval_status = 'miss' and p_top_similarity_score is null)
       or (p_top_similarity_score is not null and (p_top_similarity_score < 0 or p_top_similarity_score > 1)) then
        return jsonb_build_object('type', 'invalid_retrieval_result', 'run_id', p_run_id);
    end if;

    select count(*)
    into v_malformed_count
    from jsonb_array_elements(p_retrieval_chunks) as chunk_item
    where jsonb_typeof(chunk_item) <> 'object'
       or not (chunk_item ? 'chunk_id')
       or not (chunk_item ? 'article_id')
       or not (chunk_item ? 'chunk_index')
       or not (chunk_item ? 'similarity_score')
       or chunk_item ->> 'chunk_id' is null
       or chunk_item ->> 'article_id' is null
       or (chunk_item ->> 'chunk_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (chunk_item ->> 'article_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(chunk_item -> 'chunk_index') <> 'number'
       or jsonb_typeof(chunk_item -> 'similarity_score') <> 'number';

    if v_malformed_count > 0 then
        return jsonb_build_object('type', 'invalid_retrieval_chunks', 'run_id', p_run_id);
    end if;

    for chunk_item in
        select value
        from jsonb_array_elements(p_retrieval_chunks)
    loop
        v_chunk_index_text := chunk_item ->> 'chunk_index';
        v_similarity_score_text := chunk_item ->> 'similarity_score';

        begin
            v_similarity_score := v_similarity_score_text::double precision;
        exception
            when others then
                return jsonb_build_object('type', 'invalid_retrieval_chunks', 'run_id', p_run_id);
        end;

        if v_chunk_index_text !~ '^[0-9]+$'
           or v_similarity_score < 0
           or v_similarity_score > 1
           or v_similarity_score = 'NaN'::double precision then
            return jsonb_build_object('type', 'invalid_retrieval_chunks', 'run_id', p_run_id);
        end if;
    end loop;

    select *
    into v_run
    from public.chat_ai_runs
    where id = p_run_id
    for update;

    if not found then
        return jsonb_build_object('type', 'not_found', 'run_id', p_run_id);
    end if;

    if v_run.status in ('completed', 'failed', 'obsolete', 'ignored') then
        if v_run.processing_token = p_processing_token
           and v_run.retrieval_status = p_retrieval_status
           and v_run.top_similarity_score is not distinct from p_top_similarity_score
           and v_run.matched_chunks_count is not distinct from p_matched_chunks_count
           and v_run.retrieval_chunks is not distinct from p_retrieval_chunks then
            return jsonb_build_object(
                'type', 'already_saved',
                'run_id', v_run.id,
                'status', v_run.status
            );
        end if;

        return jsonb_build_object(
            'type', 'already_terminal',
            'run_id', v_run.id,
            'status', v_run.status
        );
    end if;

    if v_run.status <> 'processing'
       or v_run.processing_token is null
       or v_run.processing_token <> p_processing_token then
        return jsonb_build_object('type', 'owner_mismatch', 'run_id', v_run.id);
    end if;

    select status
    into v_chat_status
    from public.chats
    where id = v_run.chat_id;

    if v_chat_status in ('waiting_operator', 'resolved', 'closed') then
        update public.chat_ai_runs
        set
            status = 'ignored',
            completed_at = now()
        where id = v_run.id
          and status = 'processing'
          and processing_token = p_processing_token;

        return jsonb_build_object('type', 'ignored', 'run_id', v_run.id);
    end if;

    select cm.id
    into v_latest_client_message_id
    from public.chat_messages cm
    where cm.chat_id = v_run.chat_id
      and cm.sender_type = 'client'
    order by cm.created_at desc, cm.id desc
    limit 1;

    if v_latest_client_message_id is distinct from v_run.trigger_message_id then
        update public.chat_ai_runs
        set
            status = 'obsolete',
            completed_at = now()
        where id = v_run.id
          and status = 'processing'
          and processing_token = p_processing_token;

        return jsonb_build_object('type', 'obsolete', 'run_id', v_run.id);
    end if;

    update public.chat_ai_runs
    set
        retrieval_status = p_retrieval_status,
        top_similarity_score = p_top_similarity_score,
        matched_chunks_count = p_matched_chunks_count,
        retrieval_chunks = p_retrieval_chunks,
        error_message = case
            when p_retrieval_status = 'failed' then left(coalesce(p_error_message, 'RETRIEVAL_FAILED'), 500)
            else null
        end,
        error_type = case
            when p_retrieval_status = 'failed' then coalesce(p_error_type, 'system')
            else null
        end
    where id = v_run.id
      and status = 'processing'
      and processing_token = p_processing_token;

    return jsonb_build_object(
        'type', 'saved',
        'run_id', v_run.id,
        'retrieval_status', p_retrieval_status
    );
end;
$$;

alter function public.match_knowledge_chunks_v1(vector, double precision, integer, integer) owner to postgres;
alter function public.save_chat_ai_retrieval_result(uuid, text, text, double precision, integer, jsonb, text, text) owner to postgres;

revoke all on function public.match_knowledge_chunks_v1(vector, double precision, integer, integer) from public, anon, authenticated;
revoke all on function public.save_chat_ai_retrieval_result(uuid, text, text, double precision, integer, jsonb, text, text) from public, anon, authenticated;

grant execute on function public.match_knowledge_chunks_v1(vector, double precision, integer, integer) to service_role;
grant execute on function public.save_chat_ai_retrieval_result(uuid, text, text, double precision, integer, jsonb, text, text) to service_role;

comment on column public.chat_ai_runs.retrieval_chunks is
    'Lightweight retrieval snapshot: chunk_id, article_id, chunk_index, similarity_score. No chunk text.';

comment on column public.chat_ai_runs.matched_chunks_count is
    'Number of chunks after threshold filtering and final top-k.';

comment on function public.match_knowledge_chunks_v1(vector, double precision, integer, integer) is
    'Policy-enforced Knowledge Base vector retrieval. Returns jsonb retrieval decision and lightweight chunk refs.';

comment on function public.save_chat_ai_retrieval_result(uuid, text, text, double precision, integer, jsonb, text, text) is
    'Only approved write path for chat_ai_runs retrieval fields. Checks ownership and trigger relevance.';
