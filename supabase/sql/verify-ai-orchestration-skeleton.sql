-- Phase 5 verification: AI orchestration skeleton.
-- Read-only checks. Run after applying 20260428000600_add_ai_orchestration_skeleton.sql.

-- 1. process_incoming_telegram_message should return jsonb.
select
    p.proname,
    pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'process_incoming_telegram_message';

-- 2. AI lifecycle RPC signatures should exist.
select
    p.proname,
    pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'start_chat_ai_run',
    'mark_chat_ai_run_processing',
    'finish_chat_ai_run'
  )
order by p.proname;

-- 3. chat_ai_runs should contain ownership and observability columns.
select
    column_name,
    data_type,
    is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'chat_ai_runs'
  and column_name in (
    'processing_token',
    'config_snapshot',
    'config_hash',
    'correlation_id',
    'error_type'
  )
order by column_name;

-- 4. error_type constraint should allow only validation/system/external/null.
select
    conname,
    pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.chat_ai_runs'::regclass
  and conname = 'chat_ai_runs_error_type_check';

-- 5. Active-run unique index should still define active as pending/processing.
select
    indexname,
    indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'chat_ai_runs'
  and indexname = 'chat_ai_runs_one_active_per_chat';

-- 6. Correlation id index should exist.
select
    indexname,
    indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'chat_ai_runs'
  and indexname = 'chat_ai_runs_correlation_id_idx';

-- 7. Function definitions should include ownership and final relevance guards.
select
    p.proname,
    position('processing_token' in pg_get_functiondef(p.oid)) > 0 as has_processing_token,
    position('latest_client_message' in pg_get_functiondef(p.oid)) > 0 as has_latest_client_check,
    position('already_terminal' in pg_get_functiondef(p.oid)) > 0 as has_terminal_idempotency
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'start_chat_ai_run',
    'mark_chat_ai_run_processing',
    'finish_chat_ai_run'
  )
order by p.proname;

-- 8. Current data audit: active runs by chat.
-- Expected for a healthy system: active_run_count should never be > 1.
select
    chat_id,
    count(*) as active_run_count
from public.chat_ai_runs
where status in ('pending', 'processing')
group by chat_id
having count(*) > 1;

-- 9. Current data audit: terminal runs missing completed_at.
-- Expected: 0 rows.
select
    id,
    chat_id,
    status,
    completed_at
from public.chat_ai_runs
where status in ('completed', 'failed', 'obsolete', 'ignored')
  and completed_at is null;
