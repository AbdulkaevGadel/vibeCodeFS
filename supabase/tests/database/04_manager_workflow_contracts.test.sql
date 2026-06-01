select plan(14);

select ok(
    exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'managers'
          and c.relrowsecurity = true
    ),
    'managers RLS is enabled'
);

select is(
    (
        select count(*)::integer
        from pg_policies
        where schemaname = 'public'
          and tablename = 'managers'
          and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    ),
    0,
    'managers has no direct write policies'
);

select ok(
    to_regprocedure('public.create_manager_account_row_v1(uuid, text, text, text, text)') is not null,
    'create_manager_account_row_v1 signature exists'
);

select ok(
    to_regprocedure('public.update_manager_profile_v1(uuid, text, text, text)') is not null,
    'update_manager_profile_v1 signature exists'
);

select ok(
    to_regprocedure('public.manager_auth_user_link_exists_v1(uuid)') is not null,
    'manager_auth_user_link_exists_v1 signature exists'
);

select is(
    (
        select count(*)::integer
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in (
              'create_manager_account_row_v1',
              'update_manager_profile_v1',
              'manager_auth_user_link_exists_v1'
          )
          and p.prosecdef = true
    ),
    3,
    'manager workflow RPCs are security definer'
);

select is(
    (
        select count(*)::integer
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in (
              'create_manager_account_row_v1',
              'update_manager_profile_v1',
              'manager_auth_user_link_exists_v1'
          )
          and p.proconfig @> array['search_path=public']
    ),
    3,
    'manager workflow RPCs pin search_path to public'
);

select is(
    (
        with expected_functions(function_signature) as (
            values
                (to_regprocedure('public.create_manager_account_row_v1(uuid, text, text, text, text)')),
                (to_regprocedure('public.update_manager_profile_v1(uuid, text, text, text)')),
                (to_regprocedure('public.manager_auth_user_link_exists_v1(uuid)'))
        )
        select count(*)::integer
        from expected_functions
        where function_signature is not null
          and has_function_privilege('authenticated', function_signature, 'EXECUTE')
    ),
    3,
    'authenticated can execute manager workflow RPCs'
);

select is(
    (
        with expected_functions(function_signature) as (
            values
                (to_regprocedure('public.create_manager_account_row_v1(uuid, text, text, text, text)')),
                (to_regprocedure('public.update_manager_profile_v1(uuid, text, text, text)')),
                (to_regprocedure('public.manager_auth_user_link_exists_v1(uuid)'))
        )
        select count(*)::integer
        from expected_functions
        cross join (
            values ('anon'), ('public')
        ) as roles(role_name)
        where function_signature is not null
          and has_function_privilege(role_name, function_signature, 'EXECUTE')
    ),
    0,
    'anon and public cannot execute manager workflow RPCs'
);

select is(
    (
        select count(*)::integer
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (
              p.proname = 'create_manager_account_row_v1'
              and pg_get_function_result(p.oid) = 'uuid'
          )
    ),
    1,
    'create_manager_account_row_v1 returns uuid'
);

select is(
    (
        select count(*)::integer
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (
              p.proname = 'update_manager_profile_v1'
              and pg_get_function_result(p.oid) = 'uuid'
          )
    ),
    1,
    'update_manager_profile_v1 returns uuid'
);

select is(
    (
        select count(*)::integer
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (
              p.proname = 'manager_auth_user_link_exists_v1'
              and pg_get_function_result(p.oid) = 'boolean'
          )
    ),
    1,
    'manager_auth_user_link_exists_v1 returns boolean'
);

select is(
    (
        select count(*)::integer
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in (
              'create_manager_account_row_v1',
              'update_manager_profile_v1',
              'manager_auth_user_link_exists_v1'
          )
    ),
    3,
    'manager workflow RPCs have no extra overloads'
);

select is(
    (
        select count(*)::integer
        from public.managers
        where role not in ('admin', 'support', 'supervisor')
    ),
    0,
    'existing managers rows satisfy allowed roles'
);

select * from finish();
