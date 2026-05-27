# Supabase database tests

Эта папка содержит первые repeatable database tests для Supabase DB contracts.

## Как запускать

Canonical local command:

```bash
supabase test db
```

Если локальный Supabase stack ещё не запущен, сначала выполнить:

```bash
supabase start
```

Запускать эти tests нужно только против local Supabase database. Не запускать их против production project.

## Границы первого slice

Tests в этом slice:

- используют pgTAP;
- проверяют metadata/security/read-model shape;
- не требуют committed secrets;
- не вызывают Edge Functions, Telegram API или AI/provider APIs;
- не запускают scripts из `supabase/sql`;
- не выполняют `INSERT`, `UPDATE`, `DELETE`;
- не зависят от live KB vectors или production-only row counts.

Источники для rewrite:

- `supabase/sql/verify-chat-workflow-rpc-overloads-cleanup.sql`;
- `supabase/sql/verify-chat-messages-actor-model.sql`;
- `supabase/sql/verify-chat-ai-runs.sql`;
- `supabase/sql/verify-ai-security-boundaries.sql`;
- `supabase/sql/verify-support-admin-inbox-read-model.sql`;
- `supabase/sql/verify-kb-ingestion-pipeline-version.sql`.

Historical backfill scripts из `supabase/sql` не являются test sources для этого slice.
