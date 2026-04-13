-- Wave 2 verification: clients and chats
-- Run manually after:
-- 1. wave-2-backfill-clients.sql
-- 2. wave-2-backfill-chats.sql

-- =========================================================
-- 1. Clients count vs importable legacy users
-- =========================================================

select
  (
    select count(distinct m.user_id)
    from public.messages m
    where m.user_id is not null
  ) as legacy_distinct_user_count,
  (
    select count(*)
    from public.clients c
  ) as clients_table_count;

-- =========================================================
-- 2. Client snapshot verification
-- =========================================================

with expected_clients as (
  select
    cb.telegram_user_id,
    lu.username,
    lfn.first_name,
    lln.last_name,
    cb.created_at,
    cb.updated_at
  from (
    select
      m.user_id as telegram_user_id,
      min(m.created_at) as created_at,
      max(m.created_at) as updated_at
    from public.messages m
    where m.user_id is not null
    group by m.user_id
  ) cb
  left join (
    select distinct on (m.user_id)
      m.user_id,
      m.username
    from public.messages m
    where m.user_id is not null
      and m.username is not null
    order by m.user_id, m.created_at desc, m.id desc
  ) lu
    on lu.user_id = cb.telegram_user_id
  left join (
    select distinct on (m.user_id)
      m.user_id,
      m.first_name
    from public.messages m
    where m.user_id is not null
      and m.first_name is not null
    order by m.user_id, m.created_at desc, m.id desc
  ) lfn
    on lfn.user_id = cb.telegram_user_id
  left join (
    select distinct on (m.user_id)
      m.user_id,
      m.last_name
    from public.messages m
    where m.user_id is not null
      and m.last_name is not null
    order by m.user_id, m.created_at desc, m.id desc
  ) lln
    on lln.user_id = cb.telegram_user_id
)
select
  ec.telegram_user_id,
  ec.username as expected_username,
  c.username as actual_username,
  ec.first_name as expected_first_name,
  c.first_name as actual_first_name,
  ec.last_name as expected_last_name,
  c.last_name as actual_last_name,
  ec.created_at as expected_created_at,
  c.created_at as actual_created_at,
  ec.updated_at as expected_updated_at,
  c.updated_at as actual_updated_at
from expected_clients ec
left join public.clients c
  on c.telegram_user_id = ec.telegram_user_id
where c.id is null
   or c.username is distinct from ec.username
   or c.first_name is distinct from ec.first_name
   or c.last_name is distinct from ec.last_name
   or c.created_at is distinct from ec.created_at
   or c.updated_at is distinct from ec.updated_at
order by ec.telegram_user_id;

-- =========================================================
-- 3. Chats count vs importable legacy chats
-- =========================================================

with importable_chat_source as (
  select
    m.chat_id
  from public.messages m
  group by m.chat_id
  having count(distinct m.user_id) filter (where m.user_id is not null) = 1
     and count(distinct m.bot_username) filter (where m.bot_username is not null) = 1
)
select
  (
    select count(*)
    from importable_chat_source
  ) as importable_legacy_chat_count,
  (
    select count(*)
    from public.chats c
  ) as chats_table_count;

-- =========================================================
-- 4. Chat mapping verification
-- =========================================================

with expected_chats as (
  select
    m.chat_id as telegram_chat_id,
    min(m.user_id) as telegram_user_id,
    min(m.bot_username) as bot_username,
    min(m.created_at) as created_at,
    max(m.created_at) as updated_at
  from public.messages m
  group by m.chat_id
  having count(distinct m.user_id) filter (where m.user_id is not null) = 1
     and count(distinct m.bot_username) filter (where m.bot_username is not null) = 1
)
select
  ec.telegram_chat_id,
  ec.telegram_user_id as expected_telegram_user_id,
  cl.telegram_user_id as actual_telegram_user_id,
  ec.bot_username as expected_bot_username,
  ch.bot_username as actual_bot_username,
  'open'::text as expected_status,
  ch.status as actual_status,
  ec.created_at as expected_created_at,
  ch.created_at as actual_created_at,
  ec.updated_at as expected_updated_at,
  ch.updated_at as actual_updated_at
from expected_chats ec
left join public.chats ch
  on ch.telegram_chat_id = ec.telegram_chat_id
 and ch.bot_username = ec.bot_username
left join public.clients cl
  on cl.id = ch.client_id
where ch.id is null
   or cl.telegram_user_id is distinct from ec.telegram_user_id
   or ch.status is distinct from 'open'::text
   or ch.created_at is distinct from ec.created_at
   or ch.updated_at is distinct from ec.updated_at
order by ec.telegram_chat_id;
