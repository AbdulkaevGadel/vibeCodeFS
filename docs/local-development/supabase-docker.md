# Локальный Supabase через Docker на Windows

Этот tutorial объясняет, как поднять local Supabase stack для проекта и запустить database tests из `supabase/tests/database`.

Важно: это локальная база на твоей машине. Это не hosted Supabase project и не production.

## Зачем нужен Docker

Supabase CLI запускает локальный стек через container runtime, совместимый с Docker API. На Windows самый простой вариант для этого проекта - Docker Desktop.

Без запущенного Docker-compatible runtime команда `supabase start` не сможет поднять локальные контейнеры, а `supabase test db` не сможет выполнить pgTAP tests против local database.

Официальные docs:

- Supabase Local Development & CLI: https://supabase.com/docs/guides/local-development
- Supabase CLI Getting Started: https://supabase.com/docs/guides/local-development/cli/getting-started
- Supabase CLI Reference: https://supabase.com/docs/reference/cli/start
- Supabase Database Testing: https://supabase.com/docs/guides/database/testing
- Supabase pgTAP: https://supabase.com/docs/guides/database/extensions/pgtap

## Что будет запущено локально

`supabase start` поднимает Supabase local development stack в Docker containers. Для этого проекта важнее всего local Postgres database.

При первом запуске Supabase CLI создаёт локальное окружение на основе `supabase/config.toml` и применяет migration files из `supabase/migrations`.

Это означает:

- database tests проверяют локальную схему проекта;
- tests не должны запускаться против production;
- production secrets и service-role keys для database tests не нужны;
- изменения в локальной базе не меняют hosted Supabase project.

## Manual Step: установить Docker Desktop

Агент не устанавливает Docker Desktop автоматически. Это ручной шаг.

1. Установи Docker Desktop for Windows: https://www.docker.com/products/docker-desktop/
2. Запусти Docker Desktop.
3. Если Docker Desktop попросит включить WSL2 backend или virtualization, выполни эти шаги вручную.
4. Если после установки потребуется перезагрузка Windows, перезагрузи машину.
5. После перезагрузки снова запусти Docker Desktop и дождись состояния, где daemon работает.

Если в проекте уже используется другой Docker-compatible runtime, его можно использовать вместо Docker Desktop, но tutorial ниже ориентирован на Windows + PowerShell + Docker Desktop.

## Code Step: проверить Supabase CLI

В корне проекта выполни:

```powershell
supabase --version
```

Если команда не найдена, нужно установить Supabase CLI по официальной инструкции:

https://supabase.com/docs/guides/local-development/cli/getting-started

Для этого проекта не нужно выполнять `supabase init`: папка `supabase` и `supabase/config.toml` уже есть в репозитории.

## Code Step: запустить local Supabase stack

Перед запуском убедись, что Docker Desktop открыт и daemon уже работает.

В корне проекта выполни:

```powershell
supabase start
```

Первый запуск может быть долгим, потому что CLI скачивает Docker images.

После успешного запуска Supabase CLI обычно выводит local URLs и local credentials. Эти значения относятся только к локальному окружению.

## Verification: проверить статус

```powershell
supabase status
```

Команда должна показать, что local Supabase services запущены. Если статус не выводится, сначала разберись с ошибкой `supabase start`.

## Code Step: запустить database tests

```powershell
supabase test db
```

Эта команда запускает SQL/pgTAP tests из `supabase/tests/database` против local database.

Не добавляй production database URL и не запускай эти tests против hosted Supabase project.

## Code Step: остановить local stack

Когда локальная работа закончена:

```powershell
supabase stop
```

По умолчанию Docker resources и local data могут сохраняться между запусками. Это удобно, если нужно продолжить работу позже.

## Manual Step: сбросить local data

Если нужно очистить локальные данные и начать заново, сначала останови stack с удалением local volumes:

```powershell
supabase stop --no-backup
```

Затем снова запусти:

```powershell
supabase start
```

Это локальный destructive step: он относится к local Supabase data на твоей машине, а не к hosted Supabase project.

Если local stack уже запущен и нужно заново применить migrations к чистой local database, используй:

```powershell
supabase db reset
```

Эту команду тоже выполнять только для local database.

## Troubleshooting

### Docker Desktop не установлен

Симптом:

- `supabase start` сообщает, что Docker недоступен;
- команда `docker` не найдена.

Что сделать:

- установить Docker Desktop;
- перезапустить PowerShell после установки;
- запустить Docker Desktop перед `supabase start`.

### Docker Desktop установлен, но daemon не запущен

Симптом:

- `supabase start` видит Docker CLI, но не может подключиться к Docker daemon.

Что сделать:

- открыть Docker Desktop;
- дождаться, пока Docker Desktop полностью запустится;
- повторить `supabase start`.

### WSL2 backend не включён или не готов

Симптом:

- Docker Desktop просит включить WSL2;
- Docker Desktop не может стартовать backend;
- после установки WSL2 Docker всё ещё не работает до перезагрузки.

Что сделать:

- выполнить шаги, которые показывает Docker Desktop;
- проверить, что virtualization включена в BIOS/UEFI, если Docker Desktop явно на это указывает;
- перезагрузить Windows после установки WSL2 components;
- снова открыть Docker Desktop.

### Порт занят

Симптом:

- `supabase start` сообщает, что один из портов уже используется.

Что сделать:

- выполнить `supabase status`, если stack уже был запущен;
- остановить текущий local stack через `supabase stop`;
- если запущен другой local Supabase project, остановить его или поменять конфликтующий порт в `supabase/config.toml` отдельной согласованной задачей;
- не менять `supabase/config.toml` случайно только ради обхода ошибки.

### Local stack нужно остановить

Команда:

```powershell
supabase stop
```

Если нужно остановить все local Supabase projects на машине, у Supabase CLI есть флаг `--all`, но использовать его нужно осторожно: он может затронуть другие локальные проекты.

### Local data нужно сбросить

Для полного local reset:

```powershell
supabase stop --no-backup
supabase start
```

Для reset local database при уже поднятом stack:

```powershell
supabase db reset
```

Обе команды должны использоваться только для local environment.

## Что не нужно делать

- Не запускать database tests против production.
- Не использовать hosted Supabase connection string для `supabase test db`.
- Не выполнять scripts из `supabase/sql` как часть этого tutorial.
- Не менять migrations ради запуска tutorial.
- Не коммитить local credentials, которые выводит `supabase start`.
- Не добавлять production secrets в репозиторий.

## Короткий happy path

```powershell
supabase --version
supabase start
supabase status
supabase test db
supabase stop
```

Если `supabase start` падает, почти всегда сначала нужно проверить Docker Desktop: установлен ли он, запущен ли daemon, готов ли WSL2 backend и не заняты ли порты.
