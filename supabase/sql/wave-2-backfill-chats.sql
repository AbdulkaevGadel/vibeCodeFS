-- Wave 2 backfill: chats
-- Purpose:
-- populate public.chats from legacy public.messages
-- for the approved private-only chat shape.
--
-- This is a manual data step, not a migration.
-- Run after wave-2-backfill-clients.sql.

with importable_chat_ids as (
  select
    m.chat_id
  from public.messages m
  group by m.chat_id
  having count(distinct m.user_id) filter (where m.user_id is not null) = 1
     and count(distinct m.bot_username) filter (where m.bot_username is not null) = 1
),
importable_chat_source as (
  select distinct on (m.chat_id)
    m.chat_id as telegram_chat_id,
    m.user_id as telegram_user_id,
    m.bot_username,
    min(m.created_at) over (partition by m.chat_id) as created_at,
    max(m.created_at) over (partition by m.chat_id) as updated_at
  from public.messages m
  inner join importable_chat_ids ici
    on ici.chat_id = m.chat_id
  where m.user_id is not null
    and m.bot_username is not null
  order by m.chat_id, m.created_at desc, m.id desc
),
resolved_chat_clients as (
  select
    ics.telegram_chat_id,
    ics.telegram_user_id,
    c.id as client_id,
    ics.bot_username,
    ics.created_at,
    ics.updated_at
  from importable_chat_source ics
  inner join public.clients c
    on c.telegram_user_id = ics.telegram_user_id
)
insert into public.chats (
  telegram_chat_id,
  client_id,
  bot_username,
  status,
  created_at,
  updated_at
)
select
  rcc.telegram_chat_id,
  rcc.client_id,
  rcc.bot_username,
  'open'::text as status,
  rcc.created_at,
  rcc.updated_at
from resolved_chat_clients rcc
on conflict (telegram_chat_id, bot_username) do update
set
  client_id = excluded.client_id,
  status = excluded.status,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;
