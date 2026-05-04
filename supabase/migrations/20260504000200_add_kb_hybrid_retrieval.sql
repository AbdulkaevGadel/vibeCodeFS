-- Phase 8.4 continuation: hybrid Knowledge Base retrieval.
-- Adds lexical fallback to the existing vector retrieval policy without changing old applied migrations.

create extension if not exists pg_trgm with schema public;

create index if not exists knowledge_chunks_chunk_text_fts_idx
    on public.knowledge_chunks
    using gin (to_tsvector('russian', chunk_text))
    where embedding_status = 'completed';

create index if not exists knowledge_chunks_chunk_text_trgm_idx
    on public.knowledge_chunks
    using gin (chunk_text public.gin_trgm_ops)
    where embedding_status = 'completed';

-- Manual post-apply DB maintenance: run ANALYZE public.knowledge_chunks
-- so the planner can use fresh statistics for lexical and vector indexes.

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
            merged_candidates.chunk_id,
            merged_candidates.article_id,
            merged_candidates.chunk_index,
            coalesce(merged_candidates.similarity_score, 0) as similarity_score,
            (
                coalesce(merged_candidates.similarity_score, 0)
                + case when merged_candidates.fts_score > 0 then 0.35 else 0 end
                + least(merged_candidates.trigram_score, 1) * 0.20
            ) as retrieval_rank
        from merged_candidates
        where coalesce(merged_candidates.similarity_score, 0) >= p_match_threshold
           or merged_candidates.fts_score > 0
           or merged_candidates.trigram_score >= 0.55
        order by retrieval_rank desc, similarity_score desc, chunk_id
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
    'Policy-enforced Knowledge Base hybrid retrieval. Combines vector candidates with full-text and trigram lexical fallback.';
