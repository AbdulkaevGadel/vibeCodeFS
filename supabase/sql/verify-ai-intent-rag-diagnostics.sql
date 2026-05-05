-- Phase 11 follow-up verification: AI intents, miss reset boundary, and RAG diagnostics.
-- Read-only. Do not paste snapshots, provider payloads, config snapshots, or secrets into external chats.

-- 1. Confirm intent schema/RPC rollout.
select
    conname,
    pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.chat_ai_runs'::regclass
  and conname in (
      'chat_ai_runs_retrieval_status_check',
      'chat_ai_runs_response_kind_check',
      'chat_ai_runs_intent_type_check'
  )
order by conname;

select
    p.proname,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_userbyid(p.proowner) as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('save_chat_ai_intent_result', 'publish_chat_ai_response')
order by p.proname;

-- 2. Inspect recent intent runs without exposing snapshots/config/provider internals.
select
    r.id,
    r.chat_id,
    r.trigger_message_id,
    r.status,
    r.retrieval_status,
    r.response_kind,
    r.intent_type,
    r.response_message_id,
    r.created_at,
    r.completed_at
from public.chat_ai_runs r
where r.created_at >= now() - interval '24 hours'
  and (
      r.retrieval_status = 'skipped'
      or r.response_kind = 'intent_reply'
      or r.intent_type is not null
  )
order by r.created_at desc
limit 20;

-- 3. Check reset boundaries created by manager workflow.
select
    h.chat_id,
    h.from_status,
    h.to_status,
    h.changed_by_manager_id,
    h.created_at
from public.chat_status_history h
where h.from_status = 'waiting_operator'
  and h.to_status in ('open', 'in_progress')
order by h.created_at desc
limit 20;

-- 4. Find KB coverage for confirmation-code wording.
-- This checks content availability only; it does not change KB data.
select
    a.id as article_id,
    a.title,
    a.slug,
    a.status,
    a.updated_at
from public.knowledge_base_articles a
where a.status = 'published'
  and (
      a.title ilike '%код%'
      or a.content ilike '%код%'
      or a.title ilike '%подтвержден%'
      or a.content ilike '%подтвержден%'
      or a.title ilike '%не приходит%'
      or a.content ilike '%не приходит%'
  )
order by a.updated_at desc
limit 20;

-- 5. Check active/completed chunks for the same topic without selecting full prompt/context snapshots.
select
    a.id as article_id,
    a.title,
    a.status as article_status,
    s.id as chunk_set_id,
    s.status as chunk_set_status,
    s.is_active,
    c.id as chunk_id,
    c.chunk_index,
    c.embedding_status,
    left(c.chunk_text, 220) as chunk_preview
from public.knowledge_base_articles a
join public.knowledge_chunk_sets s on s.article_id = a.id
join public.knowledge_chunks c on c.chunk_set_id = s.id
where a.status = 'published'
  and s.is_active = true
  and s.status = 'completed'
  and (
      c.chunk_text ilike '%код%'
      or c.chunk_text ilike '%подтвержден%'
      or c.chunk_text ilike '%не приходит%'
  )
order by a.updated_at desc, c.chunk_index asc
limit 50;

-- 6. Inspect recent runs triggered by messages about confirmation code.
-- Safe fields only: no context_snapshot, prompt_snapshot, config_snapshot, provider payloads, or secrets.
select
    r.id as run_id,
    r.chat_id,
    m.id as trigger_message_id,
    left(m.text, 220) as trigger_text,
    r.status,
    r.retrieval_status,
    r.response_kind,
    r.intent_type,
    r.top_similarity_score,
    r.matched_chunks_count,
    r.retrieval_chunks,
    r.error_type,
    left(r.error_message, 220) as error_preview,
    r.created_at,
    r.completed_at
from public.chat_ai_runs r
join public.chat_messages m on m.id = r.trigger_message_id
where m.sender_type = 'client'
  and m.created_at >= now() - interval '48 hours'
  and (
      m.text ilike '%код%'
      or m.text ilike '%подтвержден%'
      or m.text ilike '%не приходит%'
  )
order by r.created_at desc
limit 20;
