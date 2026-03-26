# C4-модель SupportBot

## Краткое описание системы

SupportBot — это простой пайплайн обработки сообщений поддержки:

`Пользователь Telegram -> Telegram Bot API -> Supabase Edge Function -> Supabase Postgres -> Next.js Admin Panel`

Система принимает сообщения из Telegram, сохраняет их в Supabase, отправляет автоматический ответ и показывает сообщения в админке, задеплоенной в Vercel.

## Уровень 1: System Context

### Элементы

- `Пользователь Telegram`
  - Отправляет сообщение боту.
- `Администратор поддержки`
  - Открывает админку, читает сообщения, удаляет сообщения или целые чаты.
- `Система SupportBot`
  - Целевая система, которая принимает, хранит, отображает и позволяет управлять сообщениями поддержки.
- `Telegram Bot API`
  - Внешняя платформа, которая отправляет webhook updates и принимает исходящие ответы бота.
- `Supabase`
  - Внешняя backend-платформа для Edge Functions и Postgres.
- `Vercel`
  - Внешняя платформа хостинга админки.

### Связи

- `Пользователь Telegram -> Telegram Bot API`
  - Отправляет сообщение боту.
- `Telegram Bot API -> Система SupportBot`
  - Доставляет webhook update.
- `Система SupportBot -> Telegram Bot API`
  - Отправляет автоматический ответ.
- `Администратор поддержки -> Система SupportBot`
  - Читает и управляет сохраненными сообщениями.
- `Система SupportBot -> Supabase`
  - Сохраняет и читает сообщения.
- `Система SupportBot -> Vercel`
  - Размещает админский UI.

### Ответственность

Система принимает входящие Telegram-сообщения, валидирует входные данные, сохраняет сообщения в таблицу `messages`, отвечает пользователю и показывает историю сообщений в простой админке.

## Уровень 2: Container

### Контейнеры

- `telegram-webhook Edge Function`
  - Технологии: `Supabase Edge Functions`, `Deno`
  - Ответственность: принимает webhook-запросы от Telegram, парсит update, валидирует payload сообщения, сохраняет сообщения, отправляет ответы.
- `messages storage`
  - Технологии: `Supabase Postgres`, `Supabase REST`
  - Ответственность: хранит входящие сообщения поддержки.
- `support-admin web app`
  - Технологии: `Next.js App Router`, `React`, `Tailwind CSS`, `@supabase/supabase-js`
  - Ответственность: показывает сообщения, сгруппированные по ботам и чатам.
- `admin mutation endpoints`
  - Технологии: `Next.js Route Handlers`
  - Ответственность: удаляют одно сообщение или все сообщения чата через серверные credentials.

### Связи

- `Telegram Bot API -> telegram-webhook Edge Function`
  - HTTP POST webhook вызов.
- `telegram-webhook Edge Function -> messages storage`
  - Вставляет строки сообщений.
- `telegram-webhook Edge Function -> Telegram Bot API`
  - Отправляет ответ через Telegram API.
- `Администратор поддержки -> support-admin web app`
  - Использует UI в браузере.
- `support-admin web app -> messages storage`
  - Читает сообщения через anon key.
- `support-admin web app -> admin mutation endpoints`
  - Отправляет действия на удаление.
- `admin mutation endpoints -> messages storage`
  - Удаляют данные через service role key.

## Уровень 3: Component

### telegram-webhook Edge Function

#### Компоненты

- `HTTP Entry Point`
  - Файл: `supabase/functions/telegram-webhook/index.ts`
  - Ответственность: принимает POST-запросы, оркестрирует полный сценарий, ловит ошибки, возвращает HTTP 200.
- `Telegram Types`
  - Файл: `supabase/functions/telegram-webhook/types/telegram.ts`
  - Ответственность: общая типизация входящего payload от Telegram.
- `Update Parser`
  - Файл: `supabase/functions/telegram-webhook/lib/parse-update.ts`
  - Ответственность: извлекает `message`, `chatId` и `messageText` из update.
- `Message Validation`
  - Файл: `supabase/functions/telegram-webhook/lib/validate-message.ts`
  - Ответственность: отдельно проверяет условия для ответа и для сохранения.
- `Environment Access`
  - Файл: `supabase/functions/telegram-webhook/lib/env.ts`
  - Ответственность: централизованный доступ к runtime env-переменным.
- `Constants`
  - Файл: `supabase/functions/telegram-webhook/lib/constants.ts`
  - Ответственность: общие инфраструктурные константы, например Telegram API base URL.
- `Bot Username Resolver`
  - Файл: `supabase/functions/telegram-webhook/lib/get-bot-username.ts`
  - Ответственность: вызывает `getMe` и кеширует `bot_username`.
- `Reply Builder`
  - Файл: `supabase/functions/telegram-webhook/lib/get-reply-text.ts`
  - Ответственность: строит текст ответа на основе входящего текста сообщения.
- `Message Persistence`
  - Файл: `supabase/functions/telegram-webhook/lib/save-incoming-message.ts`
  - Ответственность: вставляет данные сообщения в `messages`.
- `Telegram Sender`
  - Файл: `supabase/functions/telegram-webhook/lib/send-telegram-message.ts`
  - Ответственность: отправляет ответы через Telegram `sendMessage`.
- `Success Response Builder`
  - Файл: `supabase/functions/telegram-webhook/lib/create-success-response.ts`
  - Ответственность: возвращает стандартный HTTP 200 ответ для Telegram.

#### Связи

- `HTTP Entry Point -> Update Parser`
- `HTTP Entry Point -> Message Validation`
- `HTTP Entry Point -> Environment Access`
- `HTTP Entry Point -> Bot Username Resolver`
- `HTTP Entry Point -> Message Persistence`
- `HTTP Entry Point -> Reply Builder`
- `HTTP Entry Point -> Telegram Sender`
- `HTTP Entry Point -> Success Response Builder`

### support-admin web app

#### Компоненты

- `Home Page`
  - Файл: `support-admin/src/app/page.tsx`
  - Ответственность: загружает сообщения, строит фильтры, группирует чаты, рендерит сообщения выбранного чата.
- `Supabase Read Client`
  - Файл: `support-admin/src/lib/supabase.ts`
  - Ответственность: создает безопасный для браузера клиент Supabase с anon key.
- `Supabase Admin Client`
  - Файл: `support-admin/src/lib/supabase-admin.ts`
  - Ответственность: создает привилегированный серверный клиент Supabase с service role key.
- `RefreshButton`
  - Файл: `support-admin/src/app/refresh-button.tsx`
  - Ответственность: обновляет состояние страницы.
- `ConfirmSubmitButton`
  - Файл: `support-admin/src/app/confirm-submit-button.tsx`
  - Ответственность: подтверждает опасные действия перед submit.
- `Delete Message Route`
  - Файл: `support-admin/src/app/api/messages/delete/route.ts`
  - Ответственность: удаляет одно сообщение по id.
- `Delete Chat Route`
  - Файл: `support-admin/src/app/api/chats/delete/route.ts`
  - Ответственность: удаляет все сообщения одного чата, при необходимости ограничивая удаление выбранным ботом.

#### Связи

- `Home Page -> Supabase Read Client`
- `Home Page -> messages storage`
- `ConfirmSubmitButton -> Delete Message Route`
- `ConfirmSubmitButton -> Delete Chat Route`
- `Delete Message Route -> Supabase Admin Client`
- `Delete Chat Route -> Supabase Admin Client`
- `Supabase Admin Client -> messages storage`

## Уровень 4: Code

### Структура проекта

```text
FullStack_Vibe_Code/
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20260324191257_create_messages_table.sql
│   │   ├── 20260325003000_add_bot_username_to_messages.sql
│   │   └── 20260325004500_backfill_bot_username.sql
│   └── functions/
│       ├── .env.example
│       └── telegram-webhook/
│           ├── index.ts
│           ├── types/
│           │   └── telegram.ts
│           └── lib/
│               ├── constants.ts
│               ├── create-success-response.ts
│               ├── env.ts
│               ├── get-bot-username.ts
│               ├── get-reply-text.ts
│               ├── parse-update.ts
│               ├── save-incoming-message.ts
│               ├── send-telegram-message.ts
│               └── validate-message.ts
└── support-admin/
    └── src/
        ├── app/
        │   ├── api/
        │   │   ├── chats/delete/route.ts
        │   │   └── messages/delete/route.ts
        │   ├── confirm-submit-button.tsx
        │   ├── layout.tsx
        │   ├── page.tsx
        │   └── refresh-button.tsx
        └── lib/
            ├── supabase-admin.ts
            └── supabase.ts
```

### Псевдокод webhook

```text
при POST-запросе
  загрузить bot token
  если bot token отсутствует
    залогировать ошибку
    вернуть 200

  распарсить telegram update
  залогировать update

  если chat id отсутствует
    залогировать ошибку
    вернуть 200

  если сообщение можно сохранять
    получить bot username
    сохранить сообщение в Supabase

  построить текст ответа
  отправить ответ в Telegram
  вернуть 200

при ошибке
  залогировать ошибку
  вернуть 200
```

### Псевдокод админки

```text
при загрузке страницы
  создать Supabase read client
  выбрать все сообщения по created_at desc
  построить фильтры по ботам
  отфильтровать сообщения по выбранному боту
  сгруппировать сообщения по chat_id
  отрендерить выбранный чат

при удалении сообщения
  отправить форму в server route
  удалить по id
  перевалидировать страницу
  сделать redirect со статусом

при удалении чата
  отправить форму в server route
  удалить по chat_id и выбранному боту
  перевалидировать страницу
  сделать redirect со статусом
```

## Data Flow

### Входящее сообщение из Telegram

1. Пользователь отправляет сообщение боту в Telegram.
2. Telegram Bot API отправляет webhook-запрос в `telegram-webhook`.
3. Edge Function парсит и валидирует update.
4. Edge Function получает username бота.
5. Edge Function вставляет строку в `messages`.
6. Edge Function отправляет текст ответа обратно в Telegram.
7. Telegram показывает ответ пользователю.

### Чтение в админке

1. Администратор поддержки открывает админку в браузере.
2. Next.js читает все сообщения из Supabase.
3. Страница строит фильтры по ботам и сводку по чатам.
4. Рендерятся сообщения выбранного чата.

### Удаление в админке

1. Администратор подтверждает удаление в UI.
2. Браузер отправляет форму в Next.js route handler.
3. Route handler удаляет данные из `messages` через service role key.
4. Страница перевалидируется и получает redirect со статусом.

## Файлы диаграмм

- `docs/c4/context.puml`
- `docs/c4/container.puml`
- `docs/c4/component-webhook-service.puml`
- `docs/c4/component-admin-panel.puml`
- `docs/c4/dynamic-webhook-flow.puml`
