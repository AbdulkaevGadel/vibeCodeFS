select plan(24);

select ok(
    to_regclass('public.chat_ai_runs') is not null,
    'chat_ai_runs table exists'
);

select is(
    (
        select count(*)::integer
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'chat_ai_runs'
          and column_name in (
              'id',
              'chat_id',
              'trigger_message_id',
              'response_message_id',
              'status',
              'retrieval_status',
              'response_kind',
              'prompt_version',
              'top_similarity_score',
              'error_message',
              'created_at',
              'updated_at',
              'started_at',
              'completed_at',
              'processing_token',
              'retrieval_chunks',
              'context_snapshot',
              'prompt_snapshot',
              'config_snapshot',
              'intent_type',
              'current_stage',
              'stage_started_at',
              'stage_error'
          )
    ),
    23,
    'chat_ai_runs exposes the expected execution/audit columns'
);

select ok(
    exists (
        select 1
        from pg_constraint
        where conrelid = 'public.chat_ai_runs'::regclass
          and conname = 'chat_ai_runs_status_check'
          and pg_get_constraintdef(oid) like '%pending%'
          and pg_get_constraintdef(oid) like '%processing%'
          and pg_get_constraintdef(oid) like '%completed%'
          and pg_get_constraintdef(oid) like '%failed%'
          and pg_get_constraintdef(oid) like '%obsolete%'
          and pg_get_constraintdef(oid) like '%ignored%'
    ),
    'chat_ai_runs status constraint preserves lifecycle states'
);

select ok(
    exists (
        select 1
        from pg_constraint
        where conrelid = 'public.chat_ai_runs'::regclass
          and conname = 'chat_ai_runs_retrieval_status_check'
          and pg_get_constraintdef(oid) like '%not_started%'
          and pg_get_constraintdef(oid) like '%hit%'
          and pg_get_constraintdef(oid) like '%miss%'
          and pg_get_constraintdef(oid) like '%empty%'
          and pg_get_constraintdef(oid) like '%failed%'
          and pg_get_constraintdef(oid) like '%skipped%'
    ),
    'chat_ai_runs retrieval_status constraint preserves current retrieval states'
);

select ok(
    exists (
        select 1
        from pg_constraint
        where conrelid = 'public.chat_ai_runs'::regclass
          and conname = 'chat_ai_runs_response_kind_check'
          and pg_get_constraintdef(oid) like '%none%'
          and pg_get_constraintdef(oid) like '%answer%'
          and pg_get_constraintdef(oid) like '%clarify%'
          and pg_get_constraintdef(oid) like '%handoff%'
          and pg_get_constraintdef(oid) like '%intent_reply%'
    ),
    'chat_ai_runs response_kind constraint preserves current response states'
);

select ok(
    exists (
        select 1
        from pg_constraint
        where conrelid = 'public.chat_ai_runs'::regclass
          and conname = 'chat_ai_runs_chat_trigger_message_unique'
    ),
    'chat_ai_runs idempotency constraint exists'
);

select ok(
    exists (
        select 1
        from pg_indexes
        where schemaname = 'public'
          and tablename = 'chat_ai_runs'
          and indexname = 'chat_ai_runs_one_active_per_chat'
          and indexdef like '%UNIQUE%'
          and indexdef like '%WHERE%'
          and indexdef like '%pending%'
          and indexdef like '%processing%'
    ),
    'chat_ai_runs has one active pending/processing run per chat'
);

select ok(
    exists (
        select 1
        from pg_trigger
        where tgrelid = 'public.chat_ai_runs'::regclass
          and tgname = 'set_chat_ai_runs_updated_at'
          and not tgisinternal
    ),
    'chat_ai_runs updated_at trigger exists'
);

select ok(
    exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'chat_ai_runs'
          and c.relrowsecurity = true
    ),
    'chat_ai_runs RLS is enabled'
);

select is(
    (
        select count(*)::integer
        from (
            values ('anon'), ('authenticated'), ('public')
        ) as roles(role_name)
        cross join (
            values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
        ) as privileges(privilege)
        where has_table_privilege(role_name, 'public.chat_ai_runs', privilege)
    ),
    0,
    'browser-facing roles have no direct chat_ai_runs table privileges'
);

select is(
    (
        select count(*)::integer
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
    ),
    0,
    'browser-facing roles cannot read or update sensitive chat_ai_runs columns'
);

select ok(
    has_table_privilege('service_role', 'public.chat_ai_runs', 'SELECT')
    and has_table_privilege('service_role', 'public.chat_ai_runs', 'INSERT')
    and has_table_privilege('service_role', 'public.chat_ai_runs', 'UPDATE')
    and has_table_privilege('service_role', 'public.chat_ai_runs', 'DELETE'),
    'service_role owns direct chat_ai_runs backend table access'
);

select ok(
    to_regprocedure('public.start_chat_ai_run(uuid, uuid, text, text, jsonb, text)') is not null,
    'start_chat_ai_run signature exists'
);

select ok(
    to_regprocedure('public.mark_chat_ai_run_processing(uuid, text)') is not null,
    'mark_chat_ai_run_processing signature exists'
);

select ok(
    to_regprocedure('public.finish_chat_ai_run(uuid, text, text, text, text)') is not null,
    'finish_chat_ai_run signature exists'
);

select ok(
    to_regprocedure('public.save_chat_ai_retrieval_result(uuid, text, text, double precision, integer, jsonb, text, text)') is not null,
    'save_chat_ai_retrieval_result signature exists'
);

select ok(
    to_regprocedure('public.save_chat_ai_retrieval_from_json_v1(uuid, text, jsonb, text, double precision, integer, integer)') is not null,
    'save_chat_ai_retrieval_from_json_v1 signature exists'
);

select ok(
    to_regprocedure('public.save_chat_ai_context_prompt_snapshot(uuid, text, jsonb, jsonb)') is not null,
    'save_chat_ai_context_prompt_snapshot signature exists'
);

select ok(
    to_regprocedure('public.save_chat_ai_intent_result(uuid, text, text)') is not null,
    'save_chat_ai_intent_result signature exists'
);

select ok(
    to_regprocedure('public.publish_chat_ai_response(uuid, text, text, text)') is not null,
    'publish_chat_ai_response signature exists'
);

select ok(
    to_regprocedure('public.recover_stale_chat_ai_runs(uuid, integer, integer)') is not null,
    'recover_stale_chat_ai_runs signature exists'
);

select ok(
    to_regprocedure('public.update_chat_ai_run_stage(uuid, text, text)') is not null,
    'update_chat_ai_run_stage signature exists'
);

select is(
    (
        with expected_functions(function_signature) as (
            values
                (to_regprocedure('public.start_chat_ai_run(uuid, uuid, text, text, jsonb, text)')),
                (to_regprocedure('public.mark_chat_ai_run_processing(uuid, text)')),
                (to_regprocedure('public.finish_chat_ai_run(uuid, text, text, text, text)')),
                (to_regprocedure('public.save_chat_ai_retrieval_result(uuid, text, text, double precision, integer, jsonb, text, text)')),
                (to_regprocedure('public.save_chat_ai_retrieval_from_json_v1(uuid, text, jsonb, text, double precision, integer, integer)')),
                (to_regprocedure('public.save_chat_ai_context_prompt_snapshot(uuid, text, jsonb, jsonb)')),
                (to_regprocedure('public.save_chat_ai_intent_result(uuid, text, text)')),
                (to_regprocedure('public.publish_chat_ai_response(uuid, text, text, text)')),
                (to_regprocedure('public.recover_stale_chat_ai_runs(uuid, integer, integer)')),
                (to_regprocedure('public.update_chat_ai_run_stage(uuid, text, text)'))
        )
        select count(*)::integer
        from expected_functions
        where function_signature is not null
          and has_function_privilege('service_role', function_signature, 'EXECUTE')
    ),
    10,
    'service_role can execute AI backend RPCs'
);

select is(
    (
        with expected_functions(function_signature) as (
            values
                (to_regprocedure('public.start_chat_ai_run(uuid, uuid, text, text, jsonb, text)')),
                (to_regprocedure('public.mark_chat_ai_run_processing(uuid, text)')),
                (to_regprocedure('public.finish_chat_ai_run(uuid, text, text, text, text)')),
                (to_regprocedure('public.save_chat_ai_retrieval_result(uuid, text, text, double precision, integer, jsonb, text, text)')),
                (to_regprocedure('public.save_chat_ai_retrieval_from_json_v1(uuid, text, jsonb, text, double precision, integer, integer)')),
                (to_regprocedure('public.save_chat_ai_context_prompt_snapshot(uuid, text, jsonb, jsonb)')),
                (to_regprocedure('public.save_chat_ai_intent_result(uuid, text, text)')),
                (to_regprocedure('public.publish_chat_ai_response(uuid, text, text, text)')),
                (to_regprocedure('public.recover_stale_chat_ai_runs(uuid, integer, integer)')),
                (to_regprocedure('public.update_chat_ai_run_stage(uuid, text, text)'))
        )
        select count(*)::integer
        from expected_functions
        cross join (
            values ('anon'), ('authenticated'), ('public')
        ) as roles(role_name)
        where function_signature is not null
          and has_function_privilege(role_name, function_signature, 'EXECUTE')
    ),
    0,
    'browser-facing roles cannot execute AI backend RPCs'
);

select * from finish();
