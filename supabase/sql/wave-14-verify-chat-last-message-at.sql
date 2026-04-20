-- Wave 14 verification: chats.last_message_at consistency

-- 1. Backfill mismatch check.
-- Expected: 0 rows.
select
    c.id as chat_id,
    c.last_message_at,
    latest.expected_last_message_at
from public.chats c
left join (
    select
        chat_id,
        max(created_at) as expected_last_message_at
    from public.chat_messages
    group by chat_id
) latest on latest.chat_id = c.id
where c.last_message_at is distinct from latest.expected_last_message_at;

-- 2. Chats without messages should keep last_message_at = null.
-- Expected: only empty chats, if any.
select
    c.id as chat_id,
    c.telegram_chat_id,
    c.bot_username,
    c.last_message_at
from public.chats c
where not exists (
    select 1
    from public.chat_messages cm
    where cm.chat_id = c.id
)
order by c.created_at desc;

-- 3. Realtime publication membership.
-- Expected: rows for public.chats and public.chat_messages.
select
    pubname,
    schemaname,
    tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('chats', 'chat_messages')
order by tablename;

-- 4. Index check.
-- Expected: idx_chats_last_message_at exists.
select
    indexname,
    indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'chats'
  and indexname = 'idx_chats_last_message_at';

-- 5. Read-model ordering preview.
select
    id,
    telegram_chat_id,
    bot_username,
    status,
    last_message_at
from public.chats
order by last_message_at desc nulls last, created_at desc
limit 20;
