-- Wave 2 backfill: clients
-- Purpose:
-- populate public.clients from legacy public.messages
-- using the latest known non-NULL profile snapshot per Telegram user.
--
-- This is a manual data step, not a migration.
-- Run after wave-2-precheck.sql.

with client_base as (
  select
    m.user_id as telegram_user_id,
    min(m.created_at) as created_at,
    max(m.created_at) as updated_at
  from public.messages m
  where m.user_id is not null
  group by m.user_id
),
last_username as (
  select distinct on (m.user_id)
    m.user_id,
    m.username
  from public.messages m
  where m.user_id is not null
    and m.username is not null
  order by m.user_id, m.created_at desc, m.id desc
),
last_first_name as (
  select distinct on (m.user_id)
    m.user_id,
    m.first_name
  from public.messages m
  where m.user_id is not null
    and m.first_name is not null
  order by m.user_id, m.created_at desc, m.id desc
),
last_last_name as (
  select distinct on (m.user_id)
    m.user_id,
    m.last_name
  from public.messages m
  where m.user_id is not null
    and m.last_name is not null
  order by m.user_id, m.created_at desc, m.id desc
)
insert into public.clients (
  telegram_user_id,
  username,
  first_name,
  last_name,
  created_at,
  updated_at
)
select
  cb.telegram_user_id,
  lu.username,
  lfn.first_name,
  lln.last_name,
  cb.created_at,
  cb.updated_at
from client_base cb
left join last_username lu
  on lu.user_id = cb.telegram_user_id
left join last_first_name lfn
  on lfn.user_id = cb.telegram_user_id
left join last_last_name lln
  on lln.user_id = cb.telegram_user_id
on conflict (telegram_user_id) do update
set
  username = excluded.username,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;
