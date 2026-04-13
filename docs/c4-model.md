# C4-модель SupportBot

## Краткое описание системы

SupportBot — это простой пайплайн обработки входящих сообщений поддержки и их просмотра в админке:

`Пользователь Telegram -> Telegram Bot API -> Supabase Edge Function -> Supabase Postgres -> Next.js Admin Panel`

Дополнительно админка использует Supabase Auth для входа администратора, восстановления пароля и проверки сессии на защищенных маршрутах.

## Уровень 1: System Context

### Элементы

- `Пользователь Telegram`
  - Отправляет сообщение боту.
- `Администратор поддержки`
  - Входит в админку, просматривает сообщения, удаляет сообщения и целые чаты.
- `Система SupportBot`
  - Принимает сообщения из Telegram, сохраняет их, автоматически отвечает и показывает их в защищенной админке.
- `Telegram Bot API`
  - Внешняя платформа, которая отправляет webhook updates и принимает исходящие ответы бота.
- `Supabase`
  - Внешняя backend-платформа для Edge Functions, Postgres, REST API и Auth.
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
  - Входит в админку и работает с сообщениями поддержки.
- `Система SupportBot -> Supabase`
  - Сохраняет сообщения, читает их и проверяет сессии администратора.
- `Система SupportBot -> Vercel`
  - Размещает UI админки.

### Ответственность

Система принимает входящие Telegram-сообщения, валидирует входные данные, сохраняет сообщения в таблицу `messages`, отвечает пользователю и показывает историю сообщений в защищенной админке с авторизацией через Supabase Auth.

## Уровень 2: Container

### Контейнеры

- `telegram-webhook Edge Function`
  - Технологии: `Supabase Edge Functions`, `Deno`
  - Ответственность: принимает webhook-запросы от Telegram, парсит update, валидирует payload сообщения, сохраняет сообщения, отправляет ответы.
- `messages storage`
  - Технологии: `Supabase Postgres`, `Supabase REST API`
  - Ответственность: хранит входящие сообщения поддержки.
- `support-admin web app`
  - Технологии: `Next.js App Router`, `React`, `Tailwind CSS`, `@supabase/supabase-js`, `@supabase/ssr`
  - Ответственность: отдает страницы входа и защищенную админку, читает сообщения, отображает чаты и сообщения, запускает удаление и logout.
- `admin mutation endpoints`
  - Технологии: `Next.js Route Handlers`
  - Ответственность: удаляют одно сообщение или все сообщения чата через server-side credentials и выставляют flash status.
- `auth actions and routes`
  - Технологии: `Next.js Server Actions`, `Next.js Route Handlers`, `Supabase Auth`
  - Ответственность: вход, logout, подтверждение recovery token, отправка письма для сброса пароля и обновление пароля.

### Связи

- `Telegram Bot API -> telegram-webhook Edge Function`
  - HTTP POST webhook вызов.
- `telegram-webhook Edge Function -> messages storage`
  - Вставляет строки сообщений через Supabase REST API.
- `telegram-webhook Edge Function -> Telegram Bot API`
  - Отправляет ответ через Telegram API.
- `Администратор поддержки -> support-admin web app`
  - Использует UI в браузере.
- `support-admin web app -> auth actions and routes`
  - Выполняет вход, logout, recovery и reset password.
- `auth actions and routes -> Supabase`
  - Проверяет сессии и работает с Supabase Auth.
- `support-admin web app -> messages storage`
  - Читает сообщения через anon key.
- `support-admin web app -> admin mutation endpoints`
  - Отправляет действия на удаление.
- `admin mutation endpoints -> messages storage`
  - Удаляют данные через service role key.
- `support-admin web app -> Vercel`
  - Размещается на платформе хостинга.

## Уровень 3: Component

### telegram-webhook Edge Function

#### Компоненты

- `HTTP Entry Point`
  - Файл: `supabase/functions/telegram-webhook/index.ts`
  - Ответственность: принимает POST-запросы, оркестрирует полный сценарий, ловит ошибки, возвращает HTTP 200 для Telegram.
- `Telegram Types`
  - Файл: `supabase/functions/telegram-webhook/types/telegram.ts`
  - Ответственность: типизация входящего payload от Telegram.
- `Update Parser`
  - Файл: `supabase/functions/telegram-webhook/lib/parse-update.ts`
  - Ответственность: извлекает `message`, `chatId` и `messageText` из update.
- `Message Validation`
  - Файл: `supabase/functions/telegram-webhook/lib/validate-message.ts`
  - Ответственность: проверяет условия для ответа и для сохранения.
- `Environment Access`
  - Файл: `supabase/functions/telegram-webhook/lib/env.ts`
  - Ответственность: централизованный доступ к runtime env-переменным.
- `Constants`
  - Файл: `supabase/functions/telegram-webhook/lib/constants.ts`
  - Ответственность: общие константы, например Telegram API base URL.
- `Bot Username Resolver`
  - Файл: `supabase/functions/telegram-webhook/lib/get-bot-username.ts`
  - Ответственность: вызывает `getMe` и кеширует `bot_username`.
- `Reply Builder`
  - Файл: `supabase/functions/telegram-webhook/lib/get-reply-text.ts`
  - Ответственность: строит текст ответа на основе входящего текста сообщения.
- `Message Persistence`
  - Файл: `supabase/functions/telegram-webhook/lib/save-incoming-message.ts`
  - Ответственность: вставляет данные сообщения в `messages` через Supabase REST API.
- `Telegram Sender`
  - Файл: `supabase/functions/telegram-webhook/lib/send-telegram-message.ts`
  - Ответственность: отправляет ответы через Telegram `sendMessage`.
- `Success Response Builder`
  - Файл: `supabase/functions/telegram-webhook/lib/create-success-response.ts`
  - Ответственность: возвращает стандартный HTTP 200 ответ для Telegram.

#### Связи

- `HTTP Entry Point -> Environment Access`
- `HTTP Entry Point -> Update Parser`
- `HTTP Entry Point -> Message Validation`
- `HTTP Entry Point -> Bot Username Resolver`
- `HTTP Entry Point -> Message Persistence`
- `HTTP Entry Point -> Reply Builder`
- `HTTP Entry Point -> Telegram Sender`
- `HTTP Entry Point -> Success Response Builder`

### support-admin web app

#### Компоненты

- `Protected Layout Guard`
  - Файл: `support-admin/src/app/(protected)/layout.tsx`
  - Ответственность: проверяет текущего пользователя через Supabase Auth и редиректит на `/login`, если сессии нет.
- `Protected Home Page`
  - Файл: `support-admin/src/app/(protected)/page.tsx`
  - Ответственность: читает flash status, запрашивает page data и собирает экран админки.
- `Support Admin Page Data`
  - Файл: `support-admin/src/app/_lib/get-support-admin-page-data.ts`
  - Ответственность: загружает сообщения, строит фильтры по ботам, выбирает чат и собирает данные для UI.
- `Admin UI Components`
  - Файлы: `support-admin/src/app/_components/*`
  - Ответственность: рендерят header, список чатов, детали чата, алерты и клиентские детали просмотра.
- `Supabase Read Client`
  - Файл: `support-admin/src/lib/supabase.ts`
  - Ответственность: создает клиент Supabase с anon key для чтения сообщений.
- `Supabase Server Client`
  - Файл: `support-admin/src/lib/supabase-server.ts`
  - Ответственность: создает server-side клиент Supabase с cookie-backed session для Auth.
- `Supabase Admin Client`
  - Файл: `support-admin/src/lib/supabase-admin.ts`
  - Ответственность: создает привилегированный серверный клиент Supabase с service role key.
- `Delete Message Route`
  - Файл: `support-admin/src/app/api/messages/delete/route.ts`
  - Ответственность: удаляет одно сообщение по id, выставляет status и перевалидирует страницу.
- `Delete Chat Route`
  - Файл: `support-admin/src/app/api/chats/delete/route.ts`
  - Ответственность: удаляет все сообщения выбранного чата, учитывая фильтр по боту.
- `Auth Pages and Actions`
  - Файлы: `support-admin/src/app/login/*`, `support-admin/src/app/forgot-password/*`, `support-admin/src/app/reset-password/*`, `support-admin/src/app/_actions/logout.ts`
  - Ответственность: вход, logout, запуск recovery flow и смена пароля.
- `Recovery Confirm Route`
  - Файл: `support-admin/src/app/auth/confirm/route.ts`
  - Ответственность: подтверждает `token_hash` через Supabase Auth и переводит пользователя на reset-password flow.

#### Связи

- `Protected Layout Guard -> Supabase Server Client`
- `Protected Home Page -> Support Admin Page Data`
- `Support Admin Page Data -> Supabase Read Client`
- `Support Admin Page Data -> messages storage`
- `Admin UI Components -> Delete Message Route`
- `Admin UI Components -> Delete Chat Route`
- `Delete Message Route -> Supabase Admin Client`
- `Delete Chat Route -> Supabase Admin Client`
- `Auth Pages and Actions -> Supabase Server Client`
- `Recovery Confirm Route -> Supabase Server Client`
- `Supabase Admin Client -> messages storage`

## Уровень 4: Code

### Структура проекта

```text
FullStack_Vibe_Code/
├── docs/
│   └── c4/
│       ├── component-admin-panel.puml
│       ├── component-webhook-service.puml
│       ├── container.puml
│       ├── context.puml
│       └── dynamic-webhook-flow.puml
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
        │   ├── _actions/
        │   │   └── logout.ts
        │   ├── _components/
        │   │   ├── admin-header.tsx
        │   │   ├── chat-details.tsx
        │   │   ├── chat-list.tsx
        │   │   └── ...
        │   ├── _lib/
        │   │   ├── flash-cookie.ts
        │   │   ├── get-support-admin-page-data.ts
        │   │   ├── page-types.ts
        │   │   └── page-utils.ts
        │   ├── (protected)/
        │   │   ├── layout.tsx
        │   │   └── page.tsx
        │   ├── api/
        │   │   ├── chats/delete/route.ts
        │   │   ├── flash/route.ts
        │   │   └── messages/delete/route.ts
        │   ├── auth/confirm/route.ts
        │   ├── forgot-password/
        │   ├── login/
        │   ├── reset-password/
        │   ├── confirm-submit-button.tsx
        │   ├── layout.tsx
        │   └── refresh-button.tsx
        ├── lib/
        │   ├── site-url.ts
        │   ├── supabase-admin.ts
        │   ├── supabase-server.ts
        │   └── supabase.ts
        └── shared/
            └── ui/
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

  если нельзя ответить или chat id отсутствует
    залогировать ошибку
    вернуть 200

  если сообщение можно сохранять
    получить bot username через getMe
    сохранить сообщение в Supabase REST API

  построить текст ответа
  отправить ответ в Telegram
  вернуть 200

при ошибке
  залогировать ошибку
  вернуть 200
```

### Псевдокод protected admin page

```text
при открытии защищенной страницы
  проверить пользователя через Supabase Auth
  если сессии нет
    сделать redirect на /login

  прочитать flash status из cookies
  загрузить сообщения из messages
  построить фильтры по bot_username
  выбрать активный бот
  сгруппировать сообщения по chat_id
  выбрать активный чат
  отрендерить header, список чатов и сообщения чата
```

### Псевдокод auth flow

```text
при логине
  провалидировать email и password
  вызвать signInWithPassword
  при успехе redirect на /

при запросе восстановления
  провалидировать email
  вызвать resetPasswordForEmail с redirectTo на /auth/confirm

при переходе по ссылке из email
  проверить token_hash через verifyOtp
  redirect на /reset-password

при смене пароля
  провалидировать новый пароль
  вызвать updateUser
  при успехе redirect на /login
```

### Псевдокод удаления

```text
при удалении сообщения
  route handler принимает formData
  удаляет запись по id через service role key
  перевалидирует /
  возвращает json или redirect со status

при удалении чата
  route handler принимает chatId и bot
  удаляет сообщения по chat_id
  если bot выбран
    ограничивает удаление выбранным ботом
  перевалидирует /
  делает redirect со status
```

## Data Flow

### Входящее сообщение из Telegram

1. Пользователь отправляет сообщение боту в Telegram.
2. Telegram Bot API отправляет webhook-запрос в `telegram-webhook`.
3. Edge Function парсит и валидирует update.
4. Edge Function получает username бота через `getMe`.
5. Edge Function вставляет строку в `messages` через Supabase REST API.
6. Edge Function отправляет текст ответа обратно в Telegram.
7. Telegram показывает ответ пользователю.

### Вход администратора

1. Администратор открывает `/login`.
2. Login action вызывает `signInWithPassword` через Supabase Auth.
3. Supabase выставляет сессионные cookies.
4. Защищенный layout проверяет пользователя через `auth.getUser()`.
5. При валидной сессии администратор попадает в защищенную админку.

### Чтение в админке

1. Администратор открывает защищенную страницу `/`.
2. Protected layout проверяет сессию.
3. Page data loader читает все сообщения из Supabase.
4. Страница строит фильтры по ботам и сводку по чатам.
5. Рендерятся список чатов и сообщения выбранного чата.

### Удаление в админке

1. Администратор подтверждает удаление в UI.
2. Браузер отправляет форму в Next.js route handler.
3. Route handler удаляет данные из `messages` через service role key.
4. Страница перевалидируется и получает flash status или JSON-ответ.

## Файлы диаграмм

- `docs/c4/context.puml`
- `docs/c4/container.puml`
- `docs/c4/component-webhook-service.puml`
- `docs/c4/component-admin-panel.puml`
- `docs/c4/dynamic-webhook-flow.puml`
