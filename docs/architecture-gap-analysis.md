# Gap analysis архитектурной документации

Дата анализа: 2026-05-14.

## Summary

Предыдущая архитектурная документация описывала ранний учебный этап: Telegram webhook сохраняет строки в `messages`, админка читает их и удаляет через route handlers. Фактическая система уже стала production-like support platform с relational workflow, RPC boundary, realtime synchronization, AI/RAG orchestration, Knowledge Base ingestion и async worker lifecycle.

## Найденные documentation gaps

### 1. Legacy message model

Gap:

- Документация описывала `messages` как основной storage.

Runtime:

- Текущий поток сообщений идет через `chat_messages`.
- Входящие сообщения сохраняются RPC `process_incoming_telegram_message`.
- Manager messages создаются RPC `process_manager_outcoming_message`.
- AI messages создаются RPC `publish_chat_ai_response`.

Как отражено в docs:

- ERD и C4 обновлены вокруг `chat_messages`.
- `messages` помечен как legacy artifact.

### 2. Отсутствовала backend-owned AI/RAG architecture

Gap:

- Не было `ai-orchestrator`, `chat_ai_runs`, retrieval snapshots, prompt/context snapshots, intent flow, handoff flow.

Runtime:

- `telegram-webhook` запускает `ai-orchestrator`.
- `ai-orchestrator` владеет run lifecycle, retrieval, prompt/context snapshots, publish and delivery.
- `chat_ai_runs` закрыт от browser-facing roles.

Как отражено в docs:

- Добавлены `component-ai-orchestrator.puml` и `ai-rag-architecture.puml`.
- `c4-model.md` описывает AI ownership and security boundary.

### 3. Отсутствовала Knowledge Base / ingestion architecture

Gap:

- Не были отражены KB articles/history, chunk sets, chunks, embeddings, ingestion workers, batch refresh.

Runtime:

- KB source of truth: `knowledge_base_articles`.
- Retrieval artifacts: `knowledge_chunk_sets` и `knowledge_chunks`.
- Workers: `kb-ingestion`, `kb-embedding-refresh-batch`.

Как отражено в docs:

- Добавлены `component-knowledge-workers.puml` и `knowledge-ingestion.puml`.
- ERD расширена knowledge and ingestion domains.

### 4. Отсутствовал realtime layer

Gap:

- Realtime вообще не был показан.

Runtime:

- `support-admin` подписывается на `chats` и `chat_messages`.
- Realtime patches UI and triggers refreshes, но не принимает workflow decisions.

Как отражено в docs:

- Добавлен `realtime-event-driven.puml`.
- `c4-model.md` явно фиксирует realtime как transport/synchronization layer.

### 5. Отсутствовал BFF / server action boundary

Gap:

- Документация описывала старые mutation route handlers.

Runtime:

- Основные privileged mutations идут через server actions + authenticated RPC.
- Auth/session boundary обрабатывается Next.js server client.

Как отражено в docs:

- Добавлен `auth-bff.puml`.
- `component-admin-panel.puml` обновлен под server actions, server components, read models.

### 6. Отсутствовал read model / pagination boundary

Gap:

- Документация предполагала загрузку всех сообщений.

Runtime:

- Inbox uses `support_admin_chat_inbox_summary`, `support_admin_bot_stats`, `get_support_admin_chat_inbox_page`.
- Сообщения выбранного чата загружаются отдельно из `chat_messages`.

Как отражено в docs:

- Read models задокументированы в `c4-model.md` и ERD.

### 7. Отсутствовал support workflow / escalation model

Gap:

- `waiting_operator`, AI handoff, assignment state/history и status history отсутствовали или были неполными.

Runtime:

- `publish_chat_ai_response(..., handoff)` переводит chat в `waiting_operator`.
- `take_chat_into_work` переводит `open/waiting_operator` в `in_progress` и пишет assignment/status history.

Как отражено в docs:

- Добавлен `support-workflow.puml`.
- ERD включает `chat_assignments`, `assignment_history`, `chat_status_history`.

## Bounded contexts, отраженные после обновления

- Telegram integration.
- Support workflow.
- Manager/admin auth и BFF.
- AI orchestration.
- RAG/retrieval.
- Knowledge Base authoring.
- Knowledge ingestion и embeddings refresh.
- Realtime synchronization.
- Read models/pagination.
- Security/RLS/RPC boundaries.

## Оставшиеся ambiguities

- Некоторые legacy migrations создают, затем заменяют/rollback-ят AI foundation. Документация описывает финальную effective runtime shape, выведенную из последних migrations и кода, а не хронологию migrations.
- `telegram-outcoming` и `ai-orchestrator` оба выполняют Telegram delivery, но для разных actor flows. Это задокументировано как текущее поведение и вынесено в архитектурные замечания: `docs/architecture-issues-2026-05-14.md`.
- Live Supabase database напрямую не опрашивалась через SQL Editor во время этого documentation-only аудита. Источником были repository migrations и runtime code.
