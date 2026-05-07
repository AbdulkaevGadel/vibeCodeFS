-- Phase 8 fix: remove ambiguous chunk_item reference in retrieval persistence RPC.
-- The original Phase 8 migration was already applied, so this is an incremental function fix.

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
    from jsonb_array_elements(p_retrieval_chunks) as chunk_entry(value)
    where jsonb_typeof(chunk_entry.value) <> 'object'
       or not (chunk_entry.value ? 'chunk_id')
       or not (chunk_entry.value ? 'article_id')
       or not (chunk_entry.value ? 'chunk_index')
       or not (chunk_entry.value ? 'similarity_score')
       or chunk_entry.value ->> 'chunk_id' is null
       or chunk_entry.value ->> 'article_id' is null
       or (chunk_entry.value ->> 'chunk_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (chunk_entry.value ->> 'article_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(chunk_entry.value -> 'chunk_index') <> 'number'
       or jsonb_typeof(chunk_entry.value -> 'similarity_score') <> 'number';

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
    'Only approved write path for chat_ai_runs retrieval fields. Checks ownership and trigger relevance.';
