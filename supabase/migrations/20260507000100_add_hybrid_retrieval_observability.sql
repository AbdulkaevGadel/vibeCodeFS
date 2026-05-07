-- Post-main improvement: backend-only observability for hybrid Knowledge Base retrieval.
-- The previous hybrid retrieval migration is already applied, so this migration only replaces RPC bodies.

create or replace function public.match_knowledge_chunks_v1(
    p_query_embedding vector(384),
    p_query_text text,
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
    v_query_text text;
    v_ts_query tsquery;
    v_has_ts_query boolean := false;
    v_top_similarity_score double precision;
    v_chunks jsonb;
    v_matched_chunks_count integer;
begin
    v_query_text := left(btrim(coalesce(p_query_text, '')), 500);

    if p_query_embedding is null
       or vector_dims(p_query_embedding) <> 384
       or v_query_text = ''
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

    begin
        v_ts_query := websearch_to_tsquery('russian', v_query_text);
        v_has_ts_query := numnode(v_ts_query) > 0;
    exception
        when others then
            v_has_ts_query := false;
    end;

    with eligible_chunks as (
        select
            kc.id as chunk_id,
            kc.article_id,
            kc.chunk_index,
            kc.embedding,
            kc.chunk_text
        from public.knowledge_chunks kc
        join public.knowledge_chunk_sets kcs on kcs.id = kc.chunk_set_id
        join public.knowledge_base_articles article on article.id = kc.article_id
        where kcs.is_active = true
          and kcs.status = 'completed'
          and kc.embedding_status = 'completed'
          and kc.embedding is not null
          and article.status = 'published'::public.article_status
    ),
    vector_candidates as (
        select
            eligible_chunks.chunk_id,
            eligible_chunks.article_id,
            eligible_chunks.chunk_index,
            1 - (eligible_chunks.embedding <=> p_query_embedding) as similarity_score
        from eligible_chunks
        order by eligible_chunks.embedding <=> p_query_embedding
        limit p_candidate_count
    ),
    top_score as (
        select max(vector_candidates.similarity_score) as score
        from vector_candidates
    ),
    fts_candidates as (
        select
            eligible_chunks.chunk_id,
            ts_rank_cd(to_tsvector('russian', eligible_chunks.chunk_text), v_ts_query) as fts_score
        from eligible_chunks
        where v_has_ts_query
          and to_tsvector('russian', eligible_chunks.chunk_text) @@ v_ts_query
        order by fts_score desc, eligible_chunks.chunk_id
        limit p_candidate_count
    ),
    trigram_candidates as (
        select
            eligible_chunks.chunk_id,
            public.word_similarity(v_query_text, eligible_chunks.chunk_text) as trigram_score
        from eligible_chunks
        where public.word_similarity(v_query_text, eligible_chunks.chunk_text) >= 0.55
        order by trigram_score desc, eligible_chunks.chunk_id
        limit p_candidate_count
    ),
    merged_candidates as (
        select
            eligible_chunks.chunk_id,
            eligible_chunks.article_id,
            eligible_chunks.chunk_index,
            vector_candidates.similarity_score,
            coalesce(fts_candidates.fts_score, 0) as fts_score,
            coalesce(trigram_candidates.trigram_score, 0) as trigram_score
        from eligible_chunks
        left join vector_candidates on vector_candidates.chunk_id = eligible_chunks.chunk_id
        left join fts_candidates on fts_candidates.chunk_id = eligible_chunks.chunk_id
        left join trigram_candidates on trigram_candidates.chunk_id = eligible_chunks.chunk_id
        where vector_candidates.chunk_id is not null
           or fts_candidates.chunk_id is not null
           or trigram_candidates.chunk_id is not null
    ),
    matched as (
        select
            ranked.chunk_id,
            ranked.article_id,
            ranked.chunk_index,
            ranked.vector_similarity_score as similarity_score,
            ranked.vector_similarity_score,
            ranked.fts_score,
            ranked.trigram_score,
            ranked.retrieval_rank,
            case
                when (
                    case when ranked.vector_similarity_score >= p_match_threshold then 1 else 0 end
                    + case when ranked.fts_score > 0 then 1 else 0 end
                    + case when ranked.trigram_score >= 0.55 then 1 else 0 end
                ) > 1 then 'hybrid'
                when ranked.vector_similarity_score >= p_match_threshold then 'vector'
                when ranked.fts_score > 0 then 'fts'
                else 'trigram'
            end as match_source
        from (
            select
                merged_candidates.chunk_id,
                merged_candidates.article_id,
                merged_candidates.chunk_index,
                coalesce(merged_candidates.similarity_score, 0) as vector_similarity_score,
                merged_candidates.fts_score,
                merged_candidates.trigram_score,
                (
                    coalesce(merged_candidates.similarity_score, 0)
                    + case when merged_candidates.fts_score > 0 then 0.35 else 0 end
                    + least(merged_candidates.trigram_score, 1) * 0.20
                ) as retrieval_rank
            from merged_candidates
        ) ranked
        where ranked.vector_similarity_score >= p_match_threshold
           or ranked.fts_score > 0
           or ranked.trigram_score >= 0.55
        order by ranked.retrieval_rank desc, ranked.vector_similarity_score desc, ranked.chunk_id
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
                        'similarity_score', matched.similarity_score,
                        'match_source', matched.match_source,
                        'vector_similarity_score', matched.vector_similarity_score,
                        'fts_score', matched.fts_score,
                        'trigram_score', matched.trigram_score,
                        'retrieval_rank', matched.retrieval_rank
                    )
                    order by matched.retrieval_rank desc, matched.similarity_score desc, matched.chunk_id
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

alter function public.match_knowledge_chunks_v1(vector, text, double precision, integer, integer) owner to postgres;

revoke all on function public.match_knowledge_chunks_v1(vector, text, double precision, integer, integer) from public, anon, authenticated;

grant execute on function public.match_knowledge_chunks_v1(vector, text, double precision, integer, integer) to service_role;

comment on function public.match_knowledge_chunks_v1(vector, text, double precision, integer, integer) is
    'Policy-enforced Knowledge Base hybrid retrieval with backend-only diagnostic fields.';

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
    v_chunk_item jsonb;
    v_chunk_index_text text;
    v_similarity_score double precision;
    v_similarity_score_text text;
    v_vector_similarity_score double precision;
    v_fts_score double precision;
    v_trigram_score double precision;
    v_retrieval_rank double precision;
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
       or (p_top_similarity_score is not null and (
           p_top_similarity_score < 0
           or p_top_similarity_score > 1
           or p_top_similarity_score = 'NaN'::double precision
       )) then
        return jsonb_build_object('type', 'invalid_retrieval_result', 'run_id', p_run_id);
    end if;

    select count(*)
    into v_malformed_count
    from jsonb_array_elements(p_retrieval_chunks) as chunk_entry(value)
    where jsonb_typeof(chunk_entry.value) <> 'object'
       or not (chunk_entry.value ? 'chunk_id')
       or not (chunk_entry.value ? 'article_id')
       or not (chunk_entry.value ? 'chunk_index')
       or not (chunk_entry.value ? 'similarity_score')
       or chunk_entry.value ->> 'chunk_id' is null
       or chunk_entry.value ->> 'article_id' is null
       or (chunk_entry.value ->> 'chunk_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (chunk_entry.value ->> 'article_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(chunk_entry.value -> 'chunk_index') <> 'number'
       or jsonb_typeof(chunk_entry.value -> 'similarity_score') <> 'number'
       or (
            chunk_entry.value ? 'match_source'
            and jsonb_typeof(chunk_entry.value -> 'match_source') <> 'null'
            and (
                jsonb_typeof(chunk_entry.value -> 'match_source') <> 'string'
                or chunk_entry.value ->> 'match_source' not in ('vector', 'fts', 'trigram', 'hybrid')
            )
       )
       or (
            chunk_entry.value ? 'vector_similarity_score'
            and jsonb_typeof(chunk_entry.value -> 'vector_similarity_score') not in ('number', 'null')
       )
       or (
            chunk_entry.value ? 'fts_score'
            and jsonb_typeof(chunk_entry.value -> 'fts_score') not in ('number', 'null')
       )
       or (
            chunk_entry.value ? 'trigram_score'
            and jsonb_typeof(chunk_entry.value -> 'trigram_score') not in ('number', 'null')
       )
       or (
            chunk_entry.value ? 'retrieval_rank'
            and jsonb_typeof(chunk_entry.value -> 'retrieval_rank') not in ('number', 'null')
       );

    if v_malformed_count > 0 then
        return jsonb_build_object('type', 'invalid_retrieval_chunks', 'run_id', p_run_id);
    end if;

    for v_chunk_item in
        select chunk_entry.value
        from jsonb_array_elements(p_retrieval_chunks) as chunk_entry(value)
    loop
        v_chunk_index_text := v_chunk_item ->> 'chunk_index';
        v_similarity_score_text := v_chunk_item ->> 'similarity_score';

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

        if jsonb_typeof(v_chunk_item -> 'vector_similarity_score') = 'number' then
            v_vector_similarity_score := (v_chunk_item ->> 'vector_similarity_score')::double precision;

            if v_vector_similarity_score < 0
               or v_vector_similarity_score > 1
               or v_vector_similarity_score = 'NaN'::double precision then
                return jsonb_build_object('type', 'invalid_retrieval_chunks', 'run_id', p_run_id);
            end if;
        end if;

        if jsonb_typeof(v_chunk_item -> 'fts_score') = 'number' then
            v_fts_score := (v_chunk_item ->> 'fts_score')::double precision;

            if v_fts_score < 0
               or v_fts_score = 'NaN'::double precision then
                return jsonb_build_object('type', 'invalid_retrieval_chunks', 'run_id', p_run_id);
            end if;
        end if;

        if jsonb_typeof(v_chunk_item -> 'trigram_score') = 'number' then
            v_trigram_score := (v_chunk_item ->> 'trigram_score')::double precision;

            if v_trigram_score < 0
               or v_trigram_score > 1
               or v_trigram_score = 'NaN'::double precision then
                return jsonb_build_object('type', 'invalid_retrieval_chunks', 'run_id', p_run_id);
            end if;
        end if;

        if jsonb_typeof(v_chunk_item -> 'retrieval_rank') = 'number' then
            v_retrieval_rank := (v_chunk_item ->> 'retrieval_rank')::double precision;

            if v_retrieval_rank < 0
               or v_retrieval_rank = 'NaN'::double precision then
                return jsonb_build_object('type', 'invalid_retrieval_chunks', 'run_id', p_run_id);
            end if;
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

alter function public.save_chat_ai_retrieval_result(uuid, text, text, double precision, integer, jsonb, text, text) owner to postgres;

revoke all on function public.save_chat_ai_retrieval_result(uuid, text, text, double precision, integer, jsonb, text, text) from public, anon, authenticated;

grant execute on function public.save_chat_ai_retrieval_result(uuid, text, text, double precision, integer, jsonb, text, text) to service_role;

comment on function public.save_chat_ai_retrieval_result(uuid, text, text, double precision, integer, jsonb, text, text) is
    'Only approved write path for chat_ai_runs retrieval fields. Validates backend-only retrieval diagnostics.';
