select plan(18);

select is(
    public.get_kb_ingestion_pipeline_version_v1(),
    'kb_ingestion_v4',
    'current KB ingestion pipeline version is kb_ingestion_v4'
);

select is(
    (
        select count(*)::integer
        from information_schema.columns
        where table_schema = 'public'
          and table_name in ('knowledge_chunk_sets', 'knowledge_chunks')
          and column_name = 'ingestion_pipeline_version'
          and is_nullable = 'NO'
    ),
    2,
    'knowledge chunk tables have non-null ingestion_pipeline_version columns'
);

select is(
    (
        select count(*)::integer
        from pg_constraint
        where conrelid in (
            'public.knowledge_chunk_sets'::regclass,
            'public.knowledge_chunks'::regclass
        )
          and conname in (
            'knowledge_chunk_sets_pipeline_version_format_check',
            'knowledge_chunk_sets_article_checksum_pipeline_unique',
            'knowledge_chunk_sets_last_error_type_check',
            'knowledge_chunks_pipeline_version_format_check'
        )
    ),
    4,
    'KB pipeline version constraints exist'
);

select is(
    (
        select count(*)::integer
        from pg_constraint
        where conrelid = 'public.knowledge_chunk_sets'::regclass
          and conname = 'knowledge_chunk_sets_article_checksum_unique'
    ),
    0,
    'legacy checksum-only chunk-set unique constraint is absent'
);

select ok(
    exists (
        select 1
        from pg_indexes
        where schemaname = 'public'
          and tablename = 'knowledge_chunk_sets'
          and indexname = 'knowledge_chunk_sets_one_active_per_article'
          and indexdef like '%UNIQUE%'
          and indexdef like '%is_active%'
    ),
    'one active chunk set per article index exists'
);

select ok(
    exists (
        select 1
        from pg_indexes
        where schemaname = 'public'
          and tablename = 'knowledge_chunk_sets'
          and indexname = 'knowledge_chunk_sets_one_processing_per_article'
          and indexdef like '%UNIQUE%'
          and indexdef like '%processing%'
    ),
    'one processing chunk set per article index exists'
);

select is(
    (
        select count(*)::integer
        from public.knowledge_chunk_sets
        where ingestion_pipeline_version is null
    ),
    0,
    'existing knowledge_chunk_sets rows have pipeline versions'
);

select is(
    (
        select count(*)::integer
        from public.knowledge_chunks
        where ingestion_pipeline_version is null
    ),
    0,
    'existing knowledge_chunks rows have pipeline versions'
);

select is(
    (
        select count(*)::integer
        from (
            select article_id
            from public.knowledge_chunk_sets
            where is_active = true
            group by article_id
            having count(*) > 1
        ) duplicates
    ),
    0,
    'no article currently has more than one active chunk set'
);

select is(
    (
        select count(*)::integer
        from (
            select article_id, content_checksum, ingestion_pipeline_version
            from public.knowledge_chunk_sets
            group by article_id, content_checksum, ingestion_pipeline_version
            having count(*) > 1
        ) duplicates
    ),
    0,
    'no duplicate article/checksum/pipeline chunk sets exist'
);

select ok(
    to_regprocedure('public.claim_kb_chunk_set_from_webhook(uuid, text, uuid)') is not null,
    'claim_kb_chunk_set_from_webhook signature exists'
);

select ok(
    to_regprocedure('public.claim_next_kb_chunk_set_for_ingestion(text, uuid, integer, integer, integer)') is not null,
    'claim_next_kb_chunk_set_for_ingestion signature exists'
);

select ok(
    to_regprocedure('public.complete_kb_chunk_set_ingestion(uuid, text, text, text, jsonb)') is not null,
    'complete_kb_chunk_set_ingestion current signature exists'
);

select ok(
    to_regprocedure('public.complete_kb_chunk_set_ingestion(uuid, text, text, jsonb)') is null,
    'legacy complete_kb_chunk_set_ingestion overload is absent'
);

select ok(
    to_regprocedure('public.fail_kb_chunk_set_ingestion(uuid, text, text, text)') is not null,
    'fail_kb_chunk_set_ingestion signature exists'
);

select ok(
    to_regprocedure('public.get_kb_article_embedding_state_v1(uuid)') is not null,
    'get_kb_article_embedding_state_v1 signature exists'
);

select ok(
    to_regprocedure('public.request_kb_article_embedding_refresh_v1(uuid, integer)') is not null,
    'request_kb_article_embedding_refresh_v1 signature exists'
);

select is(
    (
        with expected_functions(function_signature) as (
            values
                (to_regprocedure('public.get_kb_ingestion_pipeline_version_v1()')),
                (to_regprocedure('public.claim_kb_chunk_set_from_webhook(uuid, text, uuid)')),
                (to_regprocedure('public.claim_next_kb_chunk_set_for_ingestion(text, uuid, integer, integer, integer)')),
                (to_regprocedure('public.complete_kb_chunk_set_ingestion(uuid, text, text, text, jsonb)')),
                (to_regprocedure('public.fail_kb_chunk_set_ingestion(uuid, text, text, text)'))
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
    'browser-facing roles cannot execute KB worker RPCs'
);

select * from finish();
