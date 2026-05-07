-- Phase 12: AI/RAG security boundaries verification.
-- Read-only script. Run in Supabase SQL Editor.
--
-- Expected execution role:
-- - SQL Editor owner role, usually postgres.
--
-- Rules:
-- - Do not paste raw secret values into this file.
-- - Do not add schema mutations here.
-- - Do not select raw context_snapshot, prompt_snapshot, config_snapshot, or provider payloads.

-- 1. AI/RAG internal table RLS status.
select
    'internal_table_rls' as check_group,
    n.nspname as schema_name,
    c.relname as table_name,
    c.relrowsecurity as rls_enabled,
    c.relforcerowsecurity as rls_forced,
    case
        when c.relrowsecurity then 'ok'
        else 'blocker: rls disabled'
    end as expected_result
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relname in (
      'chat_ai_runs',
      'knowledge_chunks',
      'knowledge_chunk_sets'
  )
order by c.relname;

-- 2. Direct table privileges for browser-facing roles.
-- Expected:
-- - anon: no direct table privileges.
-- - authenticated: no direct table privileges for AI/RAG internals.
-- - public: no direct table privileges.
select
    'internal_table_privileges' as check_group,
    role_name,
    table_name,
    privilege,
    has_table_privilege(role_name, 'public.' || table_name, privilege) as has_privilege,
    case
        when has_table_privilege(role_name, 'public.' || table_name, privilege)
            then 'blocker: direct table privilege exists'
        else 'ok'
    end as expected_result
from (
    values
        ('anon'),
        ('authenticated'),
        ('public')
) as roles(role_name)
cross join (
    values
        ('chat_ai_runs'),
        ('knowledge_chunks'),
        ('knowledge_chunk_sets')
) as tables(table_name)
cross join (
    values
        ('SELECT'),
        ('INSERT'),
        ('UPDATE'),
        ('DELETE')
) as privileges(privilege)
order by table_name, role_name, privilege;

-- 3. Sensitive chat_ai_runs column privileges.
-- Expected:
-- - anon/authenticated/public cannot read or update backend-only execution internals.
select
    'chat_ai_runs_sensitive_column_privileges' as check_group,
    role_name,
    column_name,
    privilege,
    has_column_privilege(
        role_name,
        'public.chat_ai_runs',
        column_name,
        privilege
    ) as has_privilege,
    case
        when has_column_privilege(role_name, 'public.chat_ai_runs', column_name, privilege)
            then 'blocker: sensitive column privilege exists'
        else 'ok'
    end as expected_result
from (
    values
        ('anon'),
        ('authenticated'),
        ('public')
) as roles(role_name)
cross join (
    values
        ('context_snapshot'),
        ('prompt_snapshot'),
        ('config_snapshot'),
        ('retrieval_chunks'),
        ('processing_token')
) as columns(column_name)
cross join (
    values
        ('SELECT'),
        ('UPDATE')
) as privileges(privilege)
order by role_name, column_name, privilege;

-- 4. AI execution RPC privileges.
-- Expected:
-- - service_role has EXECUTE.
-- - anon/authenticated/public do not have EXECUTE.
with expected_functions as (
    select *
    from (
        values
            ('public.start_chat_ai_run(uuid, uuid, text, text, jsonb, text)'::regprocedure),
            ('public.mark_chat_ai_run_processing(uuid, text)'::regprocedure),
            ('public.finish_chat_ai_run(uuid, text, text, text, text)'::regprocedure),
            ('public.save_chat_ai_retrieval_result(uuid, text, text, double precision, integer, jsonb, text, text)'::regprocedure),
            ('public.save_chat_ai_context_prompt_snapshot(uuid, text, jsonb, jsonb)'::regprocedure),
            ('public.save_chat_ai_intent_result(uuid, text, text)'::regprocedure),
            ('public.publish_chat_ai_response(uuid, text, text, text)'::regprocedure),
            ('public.match_knowledge_chunks_v1(vector, text, double precision, integer, integer)'::regprocedure)
    ) as f(function_signature)
)
select
    'ai_execution_rpc_privileges' as check_group,
    function_signature::text,
    role_name,
    has_function_privilege(role_name, function_signature, 'EXECUTE') as has_execute,
    case
        when role_name = 'service_role'
             and has_function_privilege(role_name, function_signature, 'EXECUTE')
            then 'ok'
        when role_name = 'service_role'
            then 'blocker: service_role cannot execute'
        when has_function_privilege(role_name, function_signature, 'EXECUTE')
            then 'blocker: browser-facing role can execute'
        else 'ok'
    end as expected_result
from expected_functions
cross join (
    values
        ('service_role'),
        ('anon'),
        ('authenticated'),
        ('public')
) as roles(role_name)
order by function_signature::text, role_name;

-- 5. Legacy retrieval RPC overload check.
-- Expected:
-- - old match_knowledge_chunks_v1(vector, double precision, integer, integer)
--   should not be executable by anon/authenticated/public if it still exists.
select
    'legacy_retrieval_rpc_overload_privileges' as check_group,
    p.oid::regprocedure::text as function_signature,
    role_name,
    has_function_privilege(role_name, p.oid, 'EXECUTE') as has_execute,
    case
        when role_name = 'service_role'
             and has_function_privilege(role_name, p.oid, 'EXECUTE')
            then 'ok'
        when role_name = 'service_role'
            then 'review: service_role cannot execute legacy overload'
        when has_function_privilege(role_name, p.oid, 'EXECUTE')
            then 'blocker: browser-facing role can execute legacy overload'
        else 'ok'
    end as expected_result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (
    values
        ('service_role'),
        ('anon'),
        ('authenticated'),
        ('public')
) as roles(role_name)
where n.nspname = 'public'
  and p.proname = 'match_knowledge_chunks_v1'
  and p.oid::regprocedure::text = 'public.match_knowledge_chunks_v1(vector,double precision,integer,integer)'
order by function_signature, role_name;

-- 6. KB ingestion worker RPC privileges.
-- Expected:
-- - service_role has EXECUTE.
-- - anon/authenticated/public do not have EXECUTE.
with expected_functions as (
    select *
    from (
        values
            ('public.claim_kb_chunk_set_from_webhook(uuid, text, uuid)'::regprocedure),
            ('public.complete_kb_chunk_set_ingestion(uuid, text, text, text, jsonb)'::regprocedure),
            ('public.fail_kb_chunk_set_ingestion(uuid, text, text, text)'::regprocedure)
    ) as f(function_signature)
)
select
    'kb_ingestion_worker_rpc_privileges' as check_group,
    function_signature::text,
    role_name,
    has_function_privilege(role_name, function_signature, 'EXECUTE') as has_execute,
    case
        when role_name = 'service_role'
             and has_function_privilege(role_name, function_signature, 'EXECUTE')
            then 'ok'
        when role_name = 'service_role'
            then 'blocker: service_role cannot execute'
        when has_function_privilege(role_name, function_signature, 'EXECUTE')
            then 'blocker: browser-facing role can execute'
        else 'ok'
    end as expected_result
from expected_functions
cross join (
    values
        ('service_role'),
        ('anon'),
        ('authenticated'),
        ('public')
) as roles(role_name)
order by function_signature::text, role_name;

-- 7. Legacy KB ingestion worker RPC overloads.
-- Expected:
-- - old complete_kb_chunk_set_ingestion(uuid, text, text, jsonb)
--   should not be executable by anon/authenticated/public if it still exists.
select
    'legacy_kb_ingestion_worker_rpc_overload_privileges' as check_group,
    p.oid::regprocedure::text as function_signature,
    role_name,
    has_function_privilege(role_name, p.oid, 'EXECUTE') as has_execute,
    case
        when role_name = 'service_role'
             and has_function_privilege(role_name, p.oid, 'EXECUTE')
            then 'ok'
        when role_name = 'service_role'
            then 'review: service_role cannot execute legacy overload'
        when has_function_privilege(role_name, p.oid, 'EXECUTE')
            then 'blocker: browser-facing role can execute legacy overload'
        else 'ok'
    end as expected_result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (
    values
        ('service_role'),
        ('anon'),
        ('authenticated'),
        ('public')
) as roles(role_name)
where n.nspname = 'public'
  and p.proname = 'complete_kb_chunk_set_ingestion'
  and p.oid::regprocedure::text = 'public.complete_kb_chunk_set_ingestion(uuid,text,text,jsonb)'
order by function_signature, role_name;

-- 8. Approved admin KB refresh RPC.
-- Expected:
-- - authenticated may execute this RPC as an admin workflow boundary.
-- - anon/public should not execute it.
select
    'approved_admin_kb_refresh_rpc_privileges' as check_group,
    'public.request_kb_article_embedding_refresh_v1(uuid, integer)'::regprocedure::text as function_signature,
    role_name,
    has_function_privilege(
        role_name,
        'public.request_kb_article_embedding_refresh_v1(uuid, integer)'::regprocedure,
        'EXECUTE'
    ) as has_execute,
    case
        when role_name = 'authenticated'
             and has_function_privilege(
                 role_name,
                 'public.request_kb_article_embedding_refresh_v1(uuid, integer)'::regprocedure,
                 'EXECUTE'
             )
            then 'ok'
        when role_name = 'authenticated'
            then 'review: authenticated cannot execute approved admin workflow rpc'
        when role_name in ('anon', 'public')
             and has_function_privilege(
                 role_name,
                 'public.request_kb_article_embedding_refresh_v1(uuid, integer)'::regprocedure,
                 'EXECUTE'
             )
            then 'blocker: anonymous/public can execute admin workflow rpc'
        else 'ok'
    end as expected_result
from (
    values
        ('authenticated'),
        ('anon'),
        ('public')
) as roles(role_name)
order by role_name;

-- 9. Summary of blocker rows from catalog privileges only.
-- If this returns any rows, Phase 12 must stop for a fix or approved follow-up.
with findings as (
    select
        'table_rls' as check_group,
        c.relname as target,
        'rls disabled' as finding
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname in ('chat_ai_runs', 'knowledge_chunks', 'knowledge_chunk_sets')
      and c.relrowsecurity = false

    union all

    select
        'table_privilege' as check_group,
        role_name || ' on public.' || table_name as target,
        privilege as finding
    from (
        values ('anon'), ('authenticated'), ('public')
    ) as roles(role_name)
    cross join (
        values ('chat_ai_runs'), ('knowledge_chunks'), ('knowledge_chunk_sets')
    ) as tables(table_name)
    cross join (
        values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
    ) as privileges(privilege)
    where has_table_privilege(role_name, 'public.' || table_name, privilege)

    union all

    select
        'chat_ai_runs_column_privilege' as check_group,
        role_name || ' on public.chat_ai_runs.' || column_name as target,
        privilege as finding
    from (
        values ('anon'), ('authenticated'), ('public')
    ) as roles(role_name)
    cross join (
        values
            ('context_snapshot'),
            ('prompt_snapshot'),
            ('config_snapshot'),
            ('retrieval_chunks'),
            ('processing_token')
    ) as columns(column_name)
    cross join (
        values ('SELECT'), ('UPDATE')
    ) as privileges(privilege)
    where has_column_privilege(role_name, 'public.chat_ai_runs', column_name, privilege)

    union all

    select
        'function_privilege' as check_group,
        role_name || ' on ' || function_signature::text as target,
        'EXECUTE' as finding
    from (
        values
            ('public.start_chat_ai_run(uuid, uuid, text, text, jsonb, text)'::regprocedure),
            ('public.mark_chat_ai_run_processing(uuid, text)'::regprocedure),
            ('public.finish_chat_ai_run(uuid, text, text, text, text)'::regprocedure),
            ('public.save_chat_ai_retrieval_result(uuid, text, text, double precision, integer, jsonb, text, text)'::regprocedure),
            ('public.save_chat_ai_context_prompt_snapshot(uuid, text, jsonb, jsonb)'::regprocedure),
            ('public.save_chat_ai_intent_result(uuid, text, text)'::regprocedure),
            ('public.publish_chat_ai_response(uuid, text, text, text)'::regprocedure),
            ('public.match_knowledge_chunks_v1(vector, text, double precision, integer, integer)'::regprocedure),
            ('public.claim_kb_chunk_set_from_webhook(uuid, text, uuid)'::regprocedure),
            ('public.complete_kb_chunk_set_ingestion(uuid, text, text, text, jsonb)'::regprocedure),
            ('public.fail_kb_chunk_set_ingestion(uuid, text, text, text)'::regprocedure)
    ) as functions(function_signature)
    cross join (
        values ('anon'), ('authenticated'), ('public')
    ) as roles(role_name)
    where has_function_privilege(role_name, function_signature, 'EXECUTE')
)
select *
from findings
order by check_group, target, finding;

