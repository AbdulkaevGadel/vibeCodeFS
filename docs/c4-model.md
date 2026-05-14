# C4-модель SupportBot

Документ фиксирует фактическую production-архитектуру проекта на 2026-05-14.

Источник истины: текущий код, миграции Supabase, RPC, Edge Functions, realtime subscriptions и Next.js server/client boundaries. Старые tutorial-level описания и legacy `messages` flow не являются источником истины.

## Архитектурная позиция

SupportBot состоит из четырех runtime-зон:

1. `Telegram Bot API` доставляет входящие сообщения и принимает исходящие ответы.
2. `Supabase Edge Functions` владеют webhook, AI orchestration, Knowledge Base ingestion и worker-процессами.
3. `Supabase Postgres` владеет support-domain schema, RPC boundary, RLS, pgvector retrieval и event triggers.
4. `support-admin` на Next.js App Router является BFF/UI-приложением: читает read models, вызывает RPC через server actions и синхронизирует UI через realtime.

Frontend не является источником бизнес-логики. Realtime используется как transport/synchronization layer, а не как orchestration layer. AI/RAG orchestration полностью backend-owned.

## Inventory C4-диаграмм

Основные C4-файлы:

- `docs/c4/context.puml` — контекст системы.
- `docs/c4/container.puml` — container diagram.
- `docs/c4/component-webhook-service.puml` — компоненты Telegram webhook.
- `docs/c4/component-admin-panel.puml` — компоненты support-admin BFF/UI.
- `docs/c4/component-ai-orchestrator.puml` — компоненты AI orchestration.
- `docs/c4/component-knowledge-workers.puml` — компоненты Knowledge ingestion workers.
- `docs/c4/ai-rag-architecture.puml` — AI/RAG architecture.
- `docs/c4/realtime-event-driven.puml` — realtime/event-driven synchronization.
- `docs/c4/telegram-integration.puml` — Telegram integration.
- `docs/c4/auth-bff.puml` — Auth/BFF boundary.
- `docs/c4/support-workflow.puml` — support workflow and escalation.
- `docs/c4/knowledge-ingestion.puml` — Knowledge ingestion lifecycle.
- `docs/c4/dynamic-webhook-flow.puml` — webhook sequence.

## Контекст системы

Акторы:

- `Telegram client` — внешний пользователь, пишет боту.
- `Manager` — пользователь админки, обрабатывает чаты.
- `Supervisor/Admin` — менеджер с расширенными правами: lifecycle, escalation, KB archive/delete, embeddings refresh.
- `AI runtime` — backend-owned execution flow внутри Supabase Edge Functions.

Внешние системы:

- `Telegram Bot API`.
- `Supabase`.
- `Vercel`.
- `Hugging Face Inference API` для embeddings и LLM calls.

Системные границы:

- Browser не пишет напрямую в privileged tables.
- Privileged mutations проходят через RPC, server actions, Edge Functions или service-role backend calls.
- `chat_ai_runs`, retrieval snapshots и worker state закрыты от browser-facing roles.

## Container View

Контейнеры:

- `telegram-webhook` — Supabase Edge Function, принимает Telegram updates и запускает AI orchestrator best-effort background invoke.
- `ai-orchestrator` — Supabase Edge Function, владеет AI run lifecycle, intent detection, retrieval, prompt/context snapshots, publish and AI delivery.
- `telegram-outcoming` — Supabase Edge Function для доставки manager-сообщений, вызывается DB trigger через `pg_net`.
- `kb-ingestion` — Supabase Edge Function, claim/process/complete chunk sets.
- `kb-embedding-refresh-batch` — Supabase Edge Function, durable batch worker for KB embeddings refresh.
- `Supabase Postgres` — DB schema, RPC boundary, RLS, read models, pgvector, triggers.
- `Supabase Auth` — auth/session source for managers.
- `Supabase Realtime` — transport for `chats` and `chat_messages` UI synchronization.

## Component View

Component diagrams разделены по runtime ownership:

- Webhook components описывают parsing/validation/persistence/orchestrator invocation.
- Admin components описывают BFF, server actions, read models, realtime client hooks и auth.
- AI components описывают backend-owned orchestration, retrieval, prompt/context snapshots, publish boundary и delivery status update.
- Knowledge components описывают article RPC, chunk-set lifecycle, ingestion worker, batch refresh worker и embedding provider boundary.

## Runtime Data Flow Summary

### Входящее сообщение из Telegram

1. Telegram вызывает `telegram-webhook`.
2. Edge Function парсит update, валидирует message и определяет bot username.
3. Входящее сообщение сохраняется через RPC `process_incoming_telegram_message`.
4. RPC upsert-ит `clients`, `chats`, вставляет `chat_messages(sender_type='client')`, обновляет `chats.last_message_at`.
5. Если сообщение новое, webhook запускает `ai-orchestrator` через `EdgeRuntime.waitUntil`.
6. Webhook возвращает HTTP 200 Telegram независимо от результата background AI flow.

### AI/RAG orchestration

1. `ai-orchestrator` валидирует internal secret.
2. Запускает/claim-ит AI run через `start_chat_ai_run` и `mark_chat_ai_run_processing`.
3. Выполняет intent branch или retrieval branch.
4. Retrieval получает query embedding у Hugging Face и вызывает `save_chat_ai_retrieval_from_json_v1`.
5. DB выполняет hybrid/vector retrieval по `knowledge_chunks` и сохраняет retrieval metadata в `chat_ai_runs`.
6. Orchestrator строит context/prompt snapshots и сохраняет их через `save_chat_ai_context_prompt_snapshot`.
7. Публикация ответа идет через `publish_chat_ai_response`.
8. AI message доставляется в Telegram самим orchestrator, затем `chat_messages.delivery_status` обновляется PATCH-запросом.

### Исходящее сообщение менеджера

1. Browser вызывает Next.js server action `sendManagerMessageAction`.
2. Server action вызывает RPC `process_manager_outcoming_message`.
3. RPC проверяет manager assignment/status, форматирует текст, вставляет `chat_messages(sender_type='manager', delivery_status='pending')`.
4. DB trigger `tr_message_deliver` вызывает `telegram-outcoming` через `pg_net`.
5. `telegram-outcoming` отправляет сообщение в Telegram и обновляет delivery status.

### Realtime synchronization

Realtime subscriptions слушают:

- `chats` INSERT/UPDATE/DELETE для inbox list patching.
- `chat_messages` INSERT для list preview/unread и selected chat timeline.
- `chat_messages` UPDATE для delivery status.

Realtime не принимает workflow decisions и не запускает orchestration. Он только доставляет изменения состояния, уже записанные backend/database boundary.

### Knowledge ingestion

1. Manager создает/обновляет KB article через RPC.
2. DB создает или переиспользует pending `knowledge_chunk_sets`.
3. Next.js server action вызывает `kb-ingestion` для конкретного chunk set.
4. Worker claim-ит chunk set, строит chunks, получает embeddings, сохраняет `knowledge_chunks`, завершает chunk set и переключает active set.
5. Batch refresh создает durable `knowledge_embedding_refresh_batches` и worker self-resume обрабатывает items.

## Security boundaries

- `service_role` используется только Edge Functions и server-side admin client.
- Browser-facing Next.js code использует authenticated session через server client или anon realtime client там, где разрешено RLS.
- AI run internals, retrieval chunks, prompt snapshots, processing tokens и worker RPC закрыты от `anon`/`authenticated`.
- KB management uses authenticated RPC; worker mutations use service-role RPC.
- `system_settings.internal_secret` является runtime secret storage exception и не должен изменяться через migrations после initial structure.

## Связанные документы

- `docs/architecture-inventory.md`
- `docs/architecture-gap-analysis.md`
- `docs/architecture-issues-2026-05-14.md`
- `docs/erd/relational-model.md`
