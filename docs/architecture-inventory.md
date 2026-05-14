# Inventory архитектурной документации

Дата аудита: 2026-05-14.

Источник истины: текущий код, Supabase migrations, RPC, Edge Functions, realtime subscriptions, Next.js server/client boundaries.

## Существующие документы и диаграммы

| File | Type | Состояние до обновления | Состояние после обновления |
|---|---|---|---|
| `docs/c4-model.md` | Architecture markdown | Устаревший tutorial-level flow вокруг legacy `messages` | Актуализирован под relational support domain, AI/RAG, KB ingestion, realtime, BFF boundaries |
| `docs/c4/context.puml` | C4 контекст системы | Устаревший: не отражал AI, KB, Hugging Face, supervisor/admin, production boundaries | Актуализирован |
| `docs/c4/container.puml` | C4 Container | Устаревший: `messages storage`, delete endpoints, отсутствовали Edge workers/RPC/realtime/AI | Актуализирован |
| `docs/c4/component-webhook-service.puml` | C4 Component | Устаревший: прямое сохранение в `messages`, автоответ webhook | Актуализирован под RPC persistence и AI invoke |
| `docs/c4/component-admin-panel.puml` | C4 Component | Устаревший: delete routes, anon reads, отсутствовали BFF/server actions/read models/KB/realtime | Актуализирован |
| `docs/c4/dynamic-webhook-flow.puml` | Sequence | Устаревший: webhook сам строил reply и писал `messages` | Актуализирован под `process_incoming_telegram_message` и `ai-orchestrator` |
| `docs/erd/relational-model.md` | ERD markdown | Частично устаревший target model: не отражал AI, KB, ingestion, read model, delivery fields | Актуализирован |
| `docs/erd/relational-model.puml` | ERD diagram | Частично устаревший support-only ERD | Актуализирован |
| `docs/skills/fullstack-vibe-code-task-reviewer/SKILL.md` | Skill docs | Не архитектурная документация runtime | Не менялся |

## Новые диаграммы

| File | Назначение |
|---|---|
| `docs/c4/component-ai-orchestrator.puml` | Component view для backend-owned AI orchestration |
| `docs/c4/component-knowledge-workers.puml` | Component view для KB ingestion и batch workers |
| `docs/c4/ai-rag-architecture.puml` | AI/RAG sequence и ownership flow |
| `docs/c4/realtime-event-driven.puml` | Realtime и event-driven synchronization flow |
| `docs/c4/telegram-integration.puml` | Incoming/outgoing Telegram integration |
| `docs/c4/auth-bff.puml` | Auth/session/BFF boundary |
| `docs/c4/support-workflow.puml` | Support lifecycle, assignment и handoff flow |
| `docs/c4/knowledge-ingestion.puml` | Knowledge ingestion lifecycle |

## Статус диаграмм

### `docs/c4/context.puml`

До:

- отсутствовали `AI/RAG`, `Knowledge Base`, `Hugging Face`;
- система описывалась как простая админка поверх сообщений;
- роли `Manager`/`Supervisor/Admin` не были разделены.

После:

- отражены Telegram, Supabase, Vercel, Hugging Face;
- зафиксировано, что frontend не владеет бизнес-логикой;
- realtime обозначен как transport/synchronization.

### `docs/c4/container.puml`

До:

- ложная центральная сущность `messages storage`;
- отсутствовали `ai-orchestrator`, `telegram-outcoming`, `kb-ingestion`, `kb-embedding-refresh-batch`;
- отсутствовали Postgres RPC/RLS/pgvector/pg_net boundaries.

После:

- отражены реальные Edge Functions;
- показана DB/RPC ownership model;
- показаны отдельные delivery paths для manager и AI сообщений;
- добавлен realtime transport layer.

### `docs/c4/component-webhook-service.puml`

До:

- webhook описывался как автор автоответа;
- persistence был описан как insert в legacy `messages`.

После:

- webhook сохраняет incoming event через `process_incoming_telegram_message`;
- AI orchestration запускается best-effort background invoke;
- бизнес-решения вынесены из webhook.

### `docs/c4/component-admin-panel.puml`

До:

- diagram ссылался на старые delete route handlers;
- не отражал Next.js server actions;
- не отражал KB page/data/actions;
- не отражал realtime hooks.

После:

- отражена BFF граница;
- показаны server actions и RPC;
- показаны read models и realtime client hooks;
- показан запуск KB ingestion.

### `docs/erd/*`

До:

- ERD покрывала только ранний support relational stage;
- отсутствовали `chat_ai_runs`, `knowledge_*`, batch refresh tables, delivery fields, read model notes.

После:

- покрыты support, manager/admin, AI, KB, ingestion и batch refresh domains;
- указаны FK/cardinality/constraints/ownership boundaries;
- legacy `messages` явно помечен как неактуальный runtime message flow.

## Удаленные или deprecated diagrams

Диаграммы не удалялись. Все существующие runtime diagrams были актуализированы.

Deprecated content:

- legacy `messages`-центричный flow;
- frontend-owned deletion/mutation endpoints как основной mutation boundary;
- webhook-owned reply builder как текущий runtime behavior;
- tutorial-level `Telegram -> Edge -> messages -> Admin` как полная архитектура.
