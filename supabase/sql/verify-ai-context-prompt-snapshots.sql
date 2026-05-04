-- Phase 9 verification: AI context and prompt snapshots.
-- Read-only checks only. Do not use this file for schema changes.

-- 1. Snapshot columns exist.
select
    column_name,
    data_type,
    is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'chat_ai_runs'
  and column_name in ('context_snapshot', 'prompt_snapshot')
order by column_name;

-- 2. Snapshot constraints exist.
select
    conname,
    pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.chat_ai_runs'::regclass
  and conname in (
      'chat_ai_runs_context_snapshot_check',
      'chat_ai_runs_prompt_snapshot_check'
  )
order by conname;

-- 3. Snapshot save RPC exists and is SECURITY DEFINER.
select
    p.proname,
    pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result,
    p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'save_chat_ai_context_prompt_snapshot';

-- 4. Function execute privileges should be backend-only.
select
    p.proname,
    has_function_privilege('public', p.oid, 'execute') as public_can_execute,
    has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
    has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
    has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'save_chat_ai_context_prompt_snapshot';

-- 5. HIT runs should have object snapshots after Phase 9 orchestrator execution.
select
    id,
    status,
    retrieval_status,
    jsonb_typeof(context_snapshot) as context_snapshot_type,
    jsonb_typeof(prompt_snapshot) as prompt_snapshot_type,
    context_snapshot ? 'current_message' as has_current_message,
    context_snapshot ? 'history_messages' as has_history_messages,
    context_snapshot ? 'kb_fragments' as has_kb_fragments,
    prompt_snapshot ? 'messages' as has_prompt_messages,
    prompt_snapshot ? 'prompt_version' as has_prompt_version
from public.chat_ai_runs
where retrieval_status = 'hit'
order by created_at desc
limit 20;

-- 6. MISS/EMPTY runs must not get snapshots in this task.
select
    id,
    status,
    retrieval_status,
    context_snapshot,
    prompt_snapshot
from public.chat_ai_runs
where retrieval_status in ('miss', 'empty')
  and (context_snapshot is not null or prompt_snapshot is not null)
order by created_at desc;

-- 7. Snapshot shape anomalies.
select
    id,
    retrieval_status,
    context_snapshot,
    prompt_snapshot
from public.chat_ai_runs
where context_snapshot is not null
  and (
      jsonb_typeof(context_snapshot) <> 'object'
      or jsonb_typeof(context_snapshot -> 'current_message') <> 'object'
      or jsonb_typeof(context_snapshot -> 'history_messages') <> 'array'
      or jsonb_typeof(context_snapshot -> 'kb_fragments') <> 'array'
      or jsonb_typeof(context_snapshot -> 'limits') <> 'object'
      or jsonb_typeof(context_snapshot -> 'source_counts') <> 'object'
  );

select
    id,
    retrieval_status,
    prompt_snapshot
from public.chat_ai_runs
where prompt_snapshot is not null
  and (
      jsonb_typeof(prompt_snapshot) <> 'object'
      or jsonb_typeof(prompt_snapshot -> 'messages') <> 'array'
      or jsonb_array_length(prompt_snapshot -> 'messages') = 0
      or prompt_snapshot ->> 'builder_version' is null
      or prompt_snapshot ->> 'prompt_version' is null
      or prompt_snapshot ->> 'estimated_chars' is null
      or (prompt_snapshot ->> 'estimated_chars') !~ '^[0-9]+$'
  );

-- 8. Prompt must not include manager/system messages in recent history.
select
    id,
    context_snapshot -> 'history_messages' as history_messages
from public.chat_ai_runs
where context_snapshot is not null
  and exists (
      select 1
      from jsonb_array_elements(context_snapshot -> 'history_messages') as history_item
      where history_item ->> 'sender_type' not in ('client', 'ai')
  );

-- 9. KB fragments must come from active, completed, published chunks.
with snapshot_fragments as (
    select
        run.id as run_id,
        fragment ->> 'chunk_id' as chunk_id_text
    from public.chat_ai_runs run
    cross join jsonb_array_elements(run.context_snapshot -> 'kb_fragments') as fragment
    where run.context_snapshot is not null
),
typed_fragments as (
    select
        run_id,
        chunk_id_text,
        case
            when chunk_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then chunk_id_text::uuid
            else null
        end as chunk_id
    from snapshot_fragments
)
select
    fragment.run_id,
    fragment.chunk_id_text as snapshot_chunk_id,
    kc.embedding_status,
    kcs.status as chunk_set_status,
    kcs.is_active,
    article.status as article_status
from typed_fragments fragment
left join public.knowledge_chunks kc on kc.id = fragment.chunk_id
left join public.knowledge_chunk_sets kcs on kcs.id = kc.chunk_set_id
left join public.knowledge_base_articles article on article.id = kc.article_id
where fragment.chunk_id is null
   or kc.id is null
   or kc.embedding_status <> 'completed'
   or kcs.status <> 'completed'
   or kcs.is_active is distinct from true
   or article.status <> 'published'::public.article_status;
