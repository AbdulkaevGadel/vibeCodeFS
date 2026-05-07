-- Runtime blocker fix: JSON transport boundary for retrieval embedding RPC.
--
-- Purpose:
-- - Edge -> PostgREST calls can hang when passing pgvector directly.
-- - Keep pgvector retrieval inside PostgreSQL.
-- - Move the HTTP/RPC transport argument from vector(384) to jsonb.
--
-- This migration does not change retrieval policy, thresholds, ranking,
-- diagnostic fields, or the existing match_knowledge_chunks_v1(vector, ...)
-- compatibility function.

create or replace function public.match_knowledge_chunks_from_json_v1(
    p_query_embedding_json jsonb,
    p_query_text text,
    p_match_threshold double precision,
    p_match_count integer,
    p_candidate_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '12000ms'
as $$
declare
    v_query_embedding vector(384);
begin
    if p_query_embedding_json is null
       or jsonb_typeof(p_query_embedding_json) is distinct from 'array' then
        return jsonb_build_object(
            'retrieval_status', 'failed',
            'error_type', 'validation',
            'error_message', 'INVALID_RETRIEVAL_REQUEST',
            'top_similarity_score', null,
            'matched_chunks_count', 0,
            'chunks', '[]'::jsonb
        );
    end if;

    if jsonb_array_length(p_query_embedding_json) <> 384
       or exists (
           select 1
           from jsonb_array_elements(p_query_embedding_json) as embedding_item(value)
           where jsonb_typeof(embedding_item.value) <> 'number'
       ) then
        return jsonb_build_object(
            'retrieval_status', 'failed',
            'error_type', 'validation',
            'error_message', 'INVALID_RETRIEVAL_REQUEST',
            'top_similarity_score', null,
            'matched_chunks_count', 0,
            'chunks', '[]'::jsonb
        );
    end if;

    select ('[' || string_agg(embedding_item.value::text, ',' order by embedding_item.ordinality) || ']')::vector(384)
    into v_query_embedding
    from jsonb_array_elements(p_query_embedding_json) with ordinality as embedding_item(value, ordinality);

    return public.match_knowledge_chunks_v1(
        v_query_embedding,
        p_query_text,
        p_match_threshold,
        p_match_count,
        p_candidate_count
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

alter function public.match_knowledge_chunks_from_json_v1(jsonb, text, double precision, integer, integer)
owner to postgres;

revoke all on function public.match_knowledge_chunks_from_json_v1(jsonb, text, double precision, integer, integer)
from public, anon, authenticated;

grant execute on function public.match_knowledge_chunks_from_json_v1(jsonb, text, double precision, integer, integer)
to service_role;

comment on function public.match_knowledge_chunks_from_json_v1(jsonb, text, double precision, integer, integer) is
    'Backend-only Knowledge Base hybrid retrieval wrapper that accepts embedding as JSON array and converts it to vector(384) inside PostgreSQL.';
