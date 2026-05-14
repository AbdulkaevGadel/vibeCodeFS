# Архитектурные замечания

Дата аудита: 2026-05-14.

Этот файл фиксирует архитектурные замечания, обнаруженные во время documentation-only аудита. Код, migrations, RPC, schema и runtime behavior не изменялись.

## 1. Разделенное ownership исходящей доставки Telegram

Проблема:

- Manager messages и AI messages доставляются через разные runtime paths.

Где обнаружено:

- Manager path:
  - `process_manager_outcoming_message` inserts `chat_messages(sender_type='manager', delivery_status='pending')`.
  - DB trigger `tr_message_deliver` вызывает `telegram-outcoming` через `pg_net`.
  - `telegram-outcoming` отправляет Telegram message и обновляет delivery status.
- AI path:
  - `publish_chat_ai_response` inserts `chat_messages(sender_type='ai', delivery_status='pending')`.
  - `ai-orchestrator` отправляет Telegram message напрямую и PATCH-ит delivery status.

Потенциальный риск:

- Retry/error handling доставки может разойтись между manager и AI messages.
- Observability и operational debugging требуют знания actor-specific delivery paths.
- Будущие изменения Telegram formatting, rate limiting или retry policy могут быть внесены в один путь и пропущены в другом.

Почему это проблема:

- Message system имеет один persisted message stream (`chat_messages`), но два владельца external side effect.
- Это не дублирующий message flow сейчас, но это split ownership внешней доставки.

Возможные направления решения без реализации:

- Задокументировать split как намеренную actor-specific boundary, если это принято.
- Или позже ввести единую backend-owned delivery boundary после отдельного design approval.
- Если delivery будет унифицирована позже, сохранить idempotency по `chat_messages.id` / `client_message_id` и atomic delivery status updates.

## 2. Hard-coded Supabase Function URL в DB trigger

Проблема:

- `fn_invoke_message_delivery` вызывает конкретный Supabase project URL.

Где обнаружено:

- `supabase/migrations/20260415000000_apex_webhooks.sql`
- Function `public.fn_invoke_message_delivery`
- URL: `https://cpmnfkszgsxdouxidpzv.supabase.co/functions/v1/telegram-outcoming`

Потенциальный риск:

- Environment promotion становится хрупким.
- Изменение project ref, region, branch project, staging project или production project потребует migration-level function replacement.
- Local/staging/prod parity сложнее поддерживать.

Почему это проблема:

- Runtime endpoint configuration встроена в database function code.
- В системе уже есть `system_settings.internal_secret`, но нет задокументированного endpoint setting для delivery target.

Возможные направления решения без реализации:

- Оставить как есть и явно документировать, что DB trigger привязан к deployed production Supabase project.
- Или вынести endpoint configuration в контролируемый DB setting/secrets mechanism.
- Или перенести manager delivery orchestration из hard-coded DB trigger в backend worker boundary.

## 3. Import style Edge Function в `telegram-outcoming`

Проблема:

- `telegram-outcoming` импортирует `@supabase/supabase-js` через bare package import.

Где обнаружено:

- `supabase/functions/telegram-outcoming/index.ts`
- `import { createClient } from "@supabase/supabase-js"`

Потенциальный риск:

- Project Deno rules предпочитают URL imports/fetch API и избегают Node.js dependency assumptions.
- Bare package imports могут зависеть от Supabase/Deno bundling behavior и local tooling configuration.

Почему это проблема:

- Остальные Edge Function flows в основном используют прямой `fetch` к Supabase REST/RPC.
- Непоследовательный import style может путать будущих maintainers и ослабляет Deno-vs-Node boundary в документации и onboarding.

Возможные направления решения без реализации:

- Задокументировать это как known exception, если deploy/runtime это стабильно поддерживает.
- Или заменить на прямой REST/RPC `fetch` в будущей implementation-задаче после approval.
- Или стандартизировать Edge Function dependency import policy в root `AGENTS.md`, если этот pattern намеренно разрешен.

## 4. AI publish создает pending message до delivery attempt

Проблема:

- `publish_chat_ai_response` сохраняет видимое AI message с `delivery_status='pending'`, затем `ai-orchestrator` выполняет Telegram delivery и обновляет status.

Где обнаружено:

- `supabase/migrations/20260505000100_publish_chat_ai_response.sql`
- `supabase/functions/ai-orchestrator/index.ts`

Потенциальный риск:

- Если orchestrator упадет после publish, но до delivery status update, UI может показывать pending AI message.
- Recovery semantics для already-published-but-not-delivered AI messages должны быть явно описаны.

Почему это проблема:

- DB корректно защищает one visible AI message per run, но delivery является отдельным side effect после publish.
- Это нормальный distributed-systems tradeoff, но для него нужны documented recovery/ops expectations.

Возможные направления решения без реализации:

- Задокументировать pending AI delivery как принятый intermediate state.
- Позже добавить operational recovery workflow, если pending AI messages могут застревать.
- Рассмотреть единый outbox/delivery worker позже, если продукту потребуется robust retry semantics.
