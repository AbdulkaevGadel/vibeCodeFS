select plan(19);

select is(
    (
        select count(*)::integer
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'take_chat_into_work'
    ),
    1,
    'take_chat_into_work has exactly one active overload'
);

select is(
    (
        select pg_get_function_identity_arguments(p.oid)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'take_chat_into_work'
    ),
    'p_chat_id uuid',
    'take_chat_into_work keeps the approved p_chat_id uuid signature'
);

select is(
    (
        select count(*)::integer
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'update_chat_status'
    ),
    1,
    'update_chat_status has exactly one active overload'
);

select is(
    (
        select pg_get_function_identity_arguments(p.oid)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'update_chat_status'
    ),
    'p_chat_id uuid, p_new_status character varying, p_expected_status character varying',
    'update_chat_status keeps the approved optimistic-status signature'
);

select is(
    (
        select count(*)::integer
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (
            (
              p.proname = 'take_chat_into_work'
              and pg_get_function_identity_arguments(p.oid) = 'p_chat_id uuid, p_manager_id uuid'
            )
            or
            (
              p.proname = 'update_chat_status'
              and pg_get_function_identity_arguments(p.oid) = 'p_chat_id uuid, p_new_status character varying'
            )
          )
    ),
    0,
    'legacy chat workflow RPC overloads are absent'
);

select ok(
    (
        select pg_get_constraintdef(oid) like '%client%'
           and pg_get_constraintdef(oid) like '%manager%'
           and pg_get_constraintdef(oid) like '%ai%'
           and pg_get_constraintdef(oid) like '%system%'
        from pg_constraint
        where conrelid = 'public.chat_messages'::regclass
          and conname = 'chat_messages_sender_type_check'
    ),
    'chat_messages sender_type constraint allows client, manager, ai, and system'
);

select ok(
    (
        select pg_get_constraintdef(oid) like '%sender_type%'
           and pg_get_constraintdef(oid) like '%manager_id IS NOT NULL%'
           and pg_get_constraintdef(oid) like '%manager_id IS NULL%'
        from pg_constraint
        where conrelid = 'public.chat_messages'::regclass
          and conname = 'chat_messages_sender_manager_consistency_check'
    ),
    'chat_messages sender/manager consistency constraint exists'
);

select is(
    (
        select count(*)::integer
        from public.chat_messages
        where sender_type not in ('client', 'manager', 'ai', 'system')
           or (sender_type = 'manager' and manager_id is null)
           or (sender_type in ('client', 'ai', 'system') and manager_id is not null)
    ),
    0,
    'existing chat_messages rows satisfy the actor model'
);

select ok(
    exists (
        select 1
        from pg_trigger
        where tgrelid = 'public.chat_messages'::regclass
          and tgname = 'tr_message_deliver'
          and not tgisinternal
    ),
    'chat_messages delivery trigger exists'
);

select ok(
    to_regclass('public.support_admin_chat_inbox_summary') is not null,
    'support_admin_chat_inbox_summary view exists'
);

select ok(
    to_regclass('public.support_admin_bot_stats') is not null,
    'support_admin_bot_stats view exists'
);

select is(
    (
        select count(*)::integer
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'support_admin_chat_inbox_summary'
          and column_name in (
              'id',
              'telegram_chat_id',
              'bot_username',
              'status',
              'client_telegram_user_id',
              'client_username',
              'client_first_name',
              'client_last_name',
              'assigned_manager_id',
              'assigned_manager_display_name',
              'assigned_manager_last_name',
              'last_message_at',
              'last_message_text',
              'last_message_sender_type',
              'last_read_at',
              'unread_count',
              'message_count',
              'created_at',
              'updated_at'
          )
    ),
    19,
    'support_admin_chat_inbox_summary exposes the expected compact row shape'
);

select is(
    (
        select count(*)::integer
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'support_admin_bot_stats'
          and column_name in ('bot_username', 'chat_count', 'message_count')
    ),
    3,
    'support_admin_bot_stats exposes the expected stat columns'
);

select ok(
    to_regprocedure('public.get_support_admin_chat_inbox_page(integer, timestamp with time zone, timestamp with time zone, uuid, text)') is not null,
    'get_support_admin_chat_inbox_page signature exists'
);

select is(
    (
        select r.security_type
        from information_schema.routines r
        where r.specific_schema = 'public'
          and r.routine_name = 'get_support_admin_chat_inbox_page'
        limit 1
    ),
    'INVOKER',
    'get_support_admin_chat_inbox_page is security invoker'
);

select ok(
    has_table_privilege('authenticated', 'public.support_admin_chat_inbox_summary', 'SELECT'),
    'authenticated can select support_admin_chat_inbox_summary'
);

select ok(
    has_table_privilege('authenticated', 'public.support_admin_bot_stats', 'SELECT'),
    'authenticated can select support_admin_bot_stats'
);

select ok(
    has_function_privilege(
        'authenticated',
        'public.get_support_admin_chat_inbox_page(integer, timestamp with time zone, timestamp with time zone, uuid, text)'::regprocedure,
        'EXECUTE'
    ),
    'authenticated can execute get_support_admin_chat_inbox_page'
);

select ok(
    jsonb_path_exists(
        public.get_support_admin_chat_inbox_page(1, null, null, null, null),
        '$.rows'
    )
    and jsonb_path_exists(
        public.get_support_admin_chat_inbox_page(1, null, null, null, null),
        '$.pageInfo'
    ),
    'get_support_admin_chat_inbox_page returns rows and pageInfo keys'
);

select * from finish();
