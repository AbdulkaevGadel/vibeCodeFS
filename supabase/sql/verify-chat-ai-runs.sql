-- Verification for Phase 3: chat_ai_runs execution/audit model.
-- Run in Supabase SQL Editor after applying:
-- supabase/migrations/20260428000200_create_chat_ai_runs.sql

-- 1. Expected:
-- table_exists = true.
select
    to_regclass('public.chat_ai_runs') is not null as table_exists;

-- 2. Expected:
-- columns include id, chat_id, trigger_message_id, response_message_id,
-- status, retrieval_status, response_kind, prompt_version,
-- top_similarity_score, error_message, created_at, updated_at,
-- started_at, completed_at.
select
    column_name,
    data_type,
    is_nullable,
    column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'chat_ai_runs'
order by ordinal_position;

-- 3. Expected:
-- constraints include:
-- chat_ai_runs_pkey,
-- chat_ai_runs_trigger_message_fk,
-- chat_ai_runs_status_check,
-- chat_ai_runs_retrieval_status_check,
-- chat_ai_runs_response_kind_check,
-- chat_ai_runs_timestamps_check,
-- chat_ai_runs_chat_trigger_message_unique.
select
    conname,
    contype,
    pg_get_constraintdef(oid) as constraint_definition
from pg_constraint
where conrelid = 'public.chat_ai_runs'::regclass
order by conname;

-- 4. Expected:
-- chat_id FK uses ON DELETE CASCADE;
-- trigger composite FK uses ON DELETE CASCADE;
-- response_message_id FK uses ON DELETE SET NULL.
select
    conname,
    pg_get_constraintdef(oid) as constraint_definition
from pg_constraint
where conrelid = 'public.chat_ai_runs'::regclass
  and contype = 'f'
order by conname;

-- 5. Expected:
-- chat_messages_chat_id_id_unique exists to support trigger message composite FK.
select
    conname,
    pg_get_constraintdef(oid) as constraint_definition
from pg_constraint
where conrelid = 'public.chat_messages'::regclass
  and conname = 'chat_messages_chat_id_id_unique';

-- 6. Expected:
-- chat_ai_runs_one_active_per_chat is UNIQUE and partial:
-- WHERE status = ANY ARRAY['pending', 'processing'].
select
    indexname,
    indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'chat_ai_runs'
order by indexname;

-- 7. Expected:
-- set_chat_ai_runs_updated_at exists and is BEFORE UPDATE.
select
    tgname as trigger_name,
    pg_get_triggerdef(oid) as trigger_definition
from pg_trigger
where tgrelid = 'public.chat_ai_runs'::regclass
  and tgname = 'set_chat_ai_runs_updated_at';

-- 8. Expected:
-- function_exists = true.
select
    to_regprocedure('public.set_chat_ai_runs_updated_at()') is not null as function_exists;

-- 9. Expected:
-- rows_count = 0 immediately after migration, unless tests were inserted later.
select
    count(*) as rows_count
from public.chat_ai_runs;
