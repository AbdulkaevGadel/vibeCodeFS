-- Phase 10 verification: AI orchestrator publish flow and retry policy support.
-- Run read-only checks in Supabase SQL Editor after applying the migration.

select
    p.proname,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_userbyid(p.proowner) as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'publish_chat_ai_response';

select
    routine_schema,
    routine_name,
    privilege_type,
    grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'publish_chat_ai_response'
order by grantee, privilege_type;

select
    conname,
    pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.chat_messages'::regclass
  and conname in (
      'chat_messages_sender_type_check',
      'chat_messages_sender_manager_consistency_check',
      'chat_messages_delivery_status_check'
  )
order by conname;

select
    conname,
    pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.chat_ai_runs'::regclass
  and conname in (
      'chat_ai_runs_status_check',
      'chat_ai_runs_retrieval_status_check',
      'chat_ai_runs_response_kind_check'
  )
order by conname;

select
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'chat_messages'
  and trigger_name in ('tr_message_validate', 'tr_message_deliver')
order by trigger_name, event_manipulation;
