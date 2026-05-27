# `supabase/sql`

Эта папка не является частью Supabase migration flow.

Schema, RPC, RLS, policy, grant, trigger и view changes должны идти через `supabase/migrations`, а не через файлы в этой папке.

## Назначение

`supabase/sql` хранит historical manual scripts:

- read-only verification checks;
- historical precheck scripts;
- historical backfill scripts;
- manual smoke checks, которые полезны для Supabase SQL Editor;
- candidates для будущих automated database tests.

Файлы отсюда не считаются применёнными автоматически. Наличие script в этой папке не означает, что он был выполнен в production Supabase project.

## Правила запуска

Перед запуском любого script:

1. Прочитать файл целиком.
2. Убедиться, что script read-only, если task не approves mutation explicitly.
3. Не запускать historical backfill scripts без отдельного approved manual step.
4. Не запускать scripts, которые требуют production-only data или secrets, как automated tests.
5. Не добавлять сюда новые schema changes.

Allowed by default:

- `SELECT`;
- metadata inspection through `information_schema`, `pg_catalog`, `pg_policies`;
- read-only calls to stable/read-only RPCs.

Forbidden by default:

- `INSERT`;
- `UPDATE`;
- `DELETE`;
- `ALTER`;
- `CREATE`;
- `DROP`;
- `GRANT`;
- `REVOKE`;
- mutating RPC calls;
- secrets or raw provider payload dumps.

## Classification

### Historical manual/backfill

Do not run without a separate approved manual step:

- `wave-2-backfill-clients.sql`;
- `wave-2-backfill-chats.sql`;
- `wave-2-backfill-managers.sql`;
- `wave-5-backfill-chat-messages.sql`.

These files mutate relational tables from legacy data.

### Read-only verification

Support-domain checks:

- `wave-2-precheck.sql`;
- `wave-2-verify-clients-and-chats.sql`;
- `wave-2-verify-managers.sql`;
- `wave-5-verify-chat-messages.sql`;
- `wave-8-verify-relational-webhook.sql`;
- `wave-14-verify-chat-last-message-at.sql`;
- `phase-7-verify-security-hardening.sql`;
- `verify-chat-messages-actor-model.sql`;
- `verify-chat-workflow-rpc-overloads-cleanup.sql`;
- `verify-take-chat-into-work-lock-fix.sql`;
- `verify-waiting-operator-workflow.sql`;
- `verify-rollback-ai-foundation.sql`;
- `verify-support-admin-inbox-read-model.sql`.

Knowledge Base checks:

- `verify-knowledge-chunking-foundation.sql`;
- `verify-kb-ingestion-pipeline.sql`;
- `verify-kb-ingestion-pipeline-version.sql`;
- `verify-kb-manual-embedding-refresh.sql`;
- `verify-kb-retrieval-policy.sql`;
- `verify-kb-embedding-refresh-batches.sql`;
- `verify-kb-chunk-set-active-switch.sql`.

AI/RAG checks:

- `verify-ai-orchestration-skeleton.sql`;
- `verify-chat-ai-runs.sql`;
- `verify-ai-orchestrator-flow.sql`;
- `verify-ai-context-prompt-snapshots.sql`;
- `verify-ai-intent-rag-diagnostics.sql`;
- `verify-ai-security-boundaries.sql`;
- `verify-ai-stale-run-recovery.sql`;
- `verify-ai-run-stage-diagnostics.sql`;
- `verify-hybrid-retrieval-observability.sql`;
- `verify-retrieval-rpc-db-timeout-guard.sql`;
- `verify-retrieval-json-embedding-rpc.sql`;
- `verify-retrieval-json-save-rpc.sql`;
- `verify-retrieval-similarity-score-contract.sql`;
- `verify-retrieval-chunk-article-id-validation.sql`.

Note: several verification files include comments that mention mutating SQL examples. Those comments are documentation, not permission to run mutations.

### Candidates for future automated database tests

Good initial candidates:

- `verify-support-admin-inbox-read-model.sql`;
- `verify-chat-messages-actor-model.sql`;
- `verify-chat-workflow-rpc-overloads-cleanup.sql`;
- `verify-take-chat-into-work-lock-fix.sql`;
- `verify-kb-ingestion-pipeline-version.sql`;
- `verify-kb-chunk-set-active-switch.sql`;
- `verify-kb-embedding-refresh-batches.sql`;
- `verify-chat-ai-runs.sql`;
- `verify-ai-security-boundaries.sql`;
- `verify-ai-run-stage-diagnostics.sql`.

Conditional candidates after rewrite with fixtures:

- `verify-kb-retrieval-policy.sql`;
- `verify-hybrid-retrieval-observability.sql`;
- `verify-retrieval-rpc-db-timeout-guard.sql`;
- `verify-retrieval-json-embedding-rpc.sql`;
- `verify-retrieval-json-save-rpc.sql`;
- `verify-retrieval-similarity-score-contract.sql`;
- `verify-retrieval-chunk-article-id-validation.sql`.

Not automated-test candidates by default:

- historical backfill scripts;
- scripts that rely on production-only row counts or existing live KB vectors;
- scripts that would expose raw user text, snapshots, provider payloads, or secrets.
