-- Runtime blocker fix: combine retrieval and retrieval-result persistence in one DB RPC.
--
-- Purpose:
-- - Edge Runtime repeatedly gets EarlyDrop while waiting for the retrieval RPC boundary.
-- - Direct DB calls are fast and valid.
-- - Persist retrieval result inside PostgreSQL before returning to Edge.
--
-- This migration does not change retrieval policy, thresholds, ranking,
-- diagnostic fields, prompt/context policy, or user-facing behavior.

create or replace function public.save_chat_ai_retrieval_from_json_v1(
    p_run_id uuid,
    p_processing_token text,
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
    v_retrieval_result jsonb;
    v_save_result jsonb;
begin
    v_retrieval_result := public.match_knowledge_chunks_from_json_v1(
        p_query_embedding_json,
        p_query_text,
        p_match_threshold,
        p_match_count,
        p_candidate_count
    );

    v_save_result := public.save_chat_ai_retrieval_result(
        p_run_id,
        p_processing_token,
        v_retrieval_result ->> 'retrieval_status',
        case
            when jsonb_typeof(v_retrieval_result -> 'top_similarity_score') = 'number'
            then (v_retrieval_result ->> 'top_similarity_score')::double precision
            else null
        end,
        coalesce((v_retrieval_result ->> 'matched_chunks_count')::integer, 0),
        coalesce(v_retrieval_result -> 'chunks', '[]'::jsonb),
        v_retrieval_result ->> 'error_message',
        v_retrieval_result ->> 'error_type'
    );

    return jsonb_build_object(
        'type', v_save_result ->> 'type',
        'run_id', coalesce(v_save_result ->> 'run_id', p_run_id::text),
        'status', v_save_result ->> 'status',
        'retrieval_status', v_retrieval_result ->> 'retrieval_status',
        'top_similarity_score', v_retrieval_result -> 'top_similarity_score',
        'matched_chunks_count', coalesce((v_retrieval_result ->> 'matched_chunks_count')::integer, 0),
        'chunks', coalesce(v_retrieval_result -> 'chunks', '[]'::jsonb),
        'error_type', v_retrieval_result ->> 'error_type',
        'error_message', v_retrieval_result ->> 'error_message'
    );
exception
    when others then
        v_retrieval_result := jsonb_build_object(
            'retrieval_status', 'failed',
            'error_type', 'system',
            'error_message', 'RETRIEVAL_RPC_FAILED',
            'top_similarity_score', null,
            'matched_chunks_count', 0,
            'chunks', '[]'::jsonb
        );

        begin
            v_save_result := public.save_chat_ai_retrieval_result(
                p_run_id,
                p_processing_token,
                'failed',
                null,
                0,
                '[]'::jsonb,
                'RETRIEVAL_RPC_FAILED',
                'system'
            );
        exception
            when others then
                v_save_result := jsonb_build_object('type', 'save_failed', 'run_id', p_run_id);
        end;

        return jsonb_build_object(
            'type', v_save_result ->> 'type',
            'run_id', coalesce(v_save_result ->> 'run_id', p_run_id::text),
            'retrieval_status', 'failed',
            'top_similarity_score', null,
            'matched_chunks_count', 0,
            'chunks', '[]'::jsonb,
            'error_type', 'system',
            'error_message', 'RETRIEVAL_RPC_FAILED'
        );
end;
$$;

alter function public.save_chat_ai_retrieval_from_json_v1(uuid, text, jsonb, text, double precision, integer, integer)
owner to postgres;

revoke all on function public.save_chat_ai_retrieval_from_json_v1(uuid, text, jsonb, text, double precision, integer, integer)
from public, anon, authenticated;

grant execute on function public.save_chat_ai_retrieval_from_json_v1(uuid, text, jsonb, text, double precision, integer, integer)
to service_role;

comment on function public.save_chat_ai_retrieval_from_json_v1(uuid, text, jsonb, text, double precision, integer, integer) is
    'Backend-only retrieval boundary that matches KB chunks from JSON embedding and persists chat_ai_runs retrieval fields in one DB call.';
