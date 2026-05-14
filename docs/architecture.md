# Production-архитектура SupportBot

Дата актуализации: 2026-05-14.

Документ описывает текущую архитектуру проекта так, как она реально реализована в коде, migrations, RPC, Edge Functions и Next.js runtime.

## Runtime-система

```text
Telegram Bot API
  -> telegram-webhook Edge Function
  -> Supabase Postgres RPC/schema
  -> ai-orchestrator Edge Function
  -> Supabase Postgres AI/RAG/KB state
  -> Telegram Bot API

support-admin Next.js
  -> Supabase Auth
  -> Supabase Postgres read models/RPC
  -> Supabase Realtime
```

## Backend ownership

Backend владеет:

- переходами support workflow;
- правилами назначения менеджеров;
- сохранением сообщений;
- состоянием Telegram delivery;
- AI orchestration;
- retrieval и prompt/context snapshots;
- жизненным циклом Knowledge Base ingestion;
- privileged mutations.

Frontend владеет:

- UI composition;
- отправкой форм;
- server action boundary;
- загрузкой page data;
- realtime UI patching.

Frontend не владеет бизнес-правилами. UI вызывает RPC/server boundaries, которые enforce-ят business invariants.

## Support domain

Центральная сущность: `chats`.

Текущие support entities:

- `clients` — Telegram users, не auth users.
- `managers` — пользователи админки, связанные с `auth.users`.
- `chats` — support workflow state по Telegram chat и bot.
- `chat_messages` — видимый message stream для client, manager, AI и system actors.
- `chat_assignments` — текущее состояние назначения.
- `assignment_history` — audit trail назначений.
- `chat_status_history` — audit trail переходов статусов.

Core statuses:

- `open`
- `waiting_operator`
- `in_progress`
- `escalated`
- `resolved`
- `closed`

`waiting_operator` — состояние AI handoff. Human takeover начинается, когда менеджер берет чат через `take_chat_into_work`: RPC назначает менеджера и переводит чат в `in_progress`.

## Actor model

`chat_messages.sender_type` поддерживает:

- `client` — сообщение Telegram user.
- `manager` — ответ человека из поддержки.
- `ai` — backend AI response.
- `system` — системная категория сообщения/event.

Constraint:

- `manager_id` обязателен только для `sender_type='manager'`.
- `client`, `ai` и `system` messages имеют `manager_id = null`.

## Message flows

### Входящее сообщение клиента

1. Telegram отправляет webhook update.
2. `telegram-webhook` валидирует и парсит update.
3. Edge Function вызывает `process_incoming_telegram_message`.
4. RPC upsert-ит `clients` и `chats`.
5. RPC вставляет `chat_messages(sender_type='client')`.
6. Если сообщение новое, webhook вызывает `ai-orchestrator` в background.

### Исходящее сообщение менеджера

1. `support-admin` вызывает `sendManagerMessageAction`.
2. Server action вызывает `process_manager_outcoming_message`.
3. RPC валидирует manager, assignment и chat status.
4. RPC вставляет `chat_messages(sender_type='manager', delivery_status='pending')`.
5. DB trigger вызывает `telegram-outcoming` через `pg_net`.
6. `telegram-outcoming` отправляет Telegram message и обновляет `delivery_status`.

### Исходящее сообщение AI

1. `ai-orchestrator` публикует ответ через `publish_chat_ai_response`.
2. RPC вставляет `chat_messages(sender_type='ai', delivery_status='pending')`.
3. RPC связывает message с `chat_ai_runs.response_message_id`.
4. Orchestrator напрямую отправляет Telegram message.
5. Orchestrator обновляет `delivery_status`.

## AI/RAG architecture

AI orchestration принадлежит backend и выполняется в `ai-orchestrator`.

State table:

- `chat_ai_runs`

Важные свойства:

- один AI run на `(chat_id, trigger_message_id)`;
- один активный pending/processing run на chat;
- `processing_token` фиксирует владельца worker execution;
- stale active runs могут быть восстановлены;
- prompt/context/retrieval/config snapshots — backend internals;
- browser-facing roles не имеют прямого доступа к `chat_ai_runs`.

Retrieval pipeline:

1. Собрать query из trigger message.
2. Запросить 384-dimensional embedding у Hugging Face.
3. Вызвать `save_chat_ai_retrieval_from_json_v1`.
4. DB конвертирует JSON embedding в `vector(384)`.
5. DB выполняет hybrid retrieval по active completed `knowledge_chunks`.
6. Retrieval использует threshold, top-k и candidate count guards.
7. Retrieval result сохраняется в `chat_ai_runs`.

Knowledge Base — source of truth для retrieval. `knowledge_chunks` — производные artifacts.

## Knowledge Base architecture

Source tables:

- `knowledge_base_articles`
- `knowledge_base_history`

Derived retrieval tables:

- `knowledge_chunk_sets`
- `knowledge_chunks`

Batch refresh tables:

- `knowledge_embedding_refresh_batches`
- `knowledge_embedding_refresh_batch_items`

Article create/update RPC создает или переиспользует pending chunk set, если статья не archived. Ingestion worker claim-ит chunk set, строит chunks, генерирует embeddings и завершает active chunk-set switch.

## Realtime architecture

Realtime subscriptions — только client-side synchronization.

Subscribed tables:

- `chats`
- `chat_messages`

Использование:

- inbox list patching;
- unread count/list preview updates;
- timeline выбранного чата;
- delivery status updates;
- refresh деталей выбранного чата при chat update.

Realtime не:

- принимает workflow transitions;
- вызывает AI;
- мутирует assignment state;
- доставляет Telegram messages.

## BFF / Auth boundary

`support-admin` использует Next.js App Router.

Server boundaries:

- protected layout проверяет `auth.getUser()`;
- server components загружают page data;
- server actions вызывают authenticated RPC;
- route handlers используются для auth/flash support там, где это нужно.

Supabase clients:

- server client: cookie-backed authenticated client;
- browser client: realtime/browser-side client;
- admin client: service-role server-only client, где он присутствует.

## Security boundaries

Privileged backend mutations разрешены через:

- RPC;
- Edge Functions;
- server actions;
- server-only admin client paths.

RLS/permissions:

- support read access ориентирован на authenticated managers;
- AI internals доступны только `service_role`;
- KB worker mutations доступны только `service_role`;
- KB authoring идет через authenticated RPC с role checks;
- `chat_ai_runs` snapshots/tokens не являются browser-facing data.

## Диаграммы

См.:

- `docs/c4-model.md`
- `docs/c4/*.puml`
- `docs/erd/relational-model.md`
- `docs/erd/relational-model.puml`

Audit docs:

- `docs/architecture-inventory.md`
- `docs/architecture-gap-analysis.md`
- `docs/architecture-issues-2026-05-14.md`
