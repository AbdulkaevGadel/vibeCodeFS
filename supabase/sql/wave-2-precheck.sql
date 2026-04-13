-- Wave 2 precheck
-- Purpose:
-- 1. verify approved manager role mapping against auth.users
-- 2. detect legacy messages rows that cannot be imported into the current private-only chat model
-- 3. measure the importable subset before managers / clients / chats backfill
--
-- This is a data-precheck script, not a migration.
-- Run manually in Supabase SQL Editor before any Wave 2 backfill scripts.

-- =========================================================
-- 1. Approved manager role mapping vs auth.users
-- =========================================================

with approved_manager_roles as (
  select *
  from (
    values
      ('57d97ebe-1a63-4860-bd31-7533c8cb0dc7'::uuid, 'admin'::text),
      ('efe7f751-a837-4030-a93f-3d58cdd1ef98'::uuid, 'supervisor'::text),
      ('06b80191-6286-4965-9fb8-f784fc09ee2c'::uuid, 'supervisor'::text),
      ('3418952f-ef57-4331-9096-73f159e70091'::uuid, 'support'::text)
  ) as t(auth_user_id, role)
)
select
  amr.auth_user_id,
  amr.role,
  au.email,
  case
    when au.id is null then 'missing_in_auth_users'
    else 'ok'
  end as check_result
from approved_manager_roles amr
left join auth.users au
  on au.id = amr.auth_user_id
order by amr.role, amr.auth_user_id;

-- =========================================================
-- 2. Legacy messages rows with NULL user_id
-- These rows cannot produce clients or chats in the current model.
-- =========================================================

select
  count(*) as null_user_id_rows
from public.messages
where user_id is null;

select
  id,
  chat_id,
  user_id,
  username,
  first_name,
  last_name,
  created_at,
  bot_username
from public.messages
where user_id is null
order by created_at, id;

-- =========================================================
-- 3. chat_id -> distinct user_id conflicts
-- Current Wave 2 supports only private-only chats:
-- one legacy chat_id must map to exactly one user_id.
-- =========================================================

select
  chat_id,
  count(distinct user_id) as distinct_user_count,
  min(created_at) as first_message_at,
  max(created_at) as last_message_at
from public.messages
where user_id is not null
group by chat_id
having count(distinct user_id) > 1
order by distinct_user_count desc, chat_id;

-- Optional drill-down for chat_id/user_id pairs
select
  chat_id,
  user_id,
  count(*) as message_count,
  min(created_at) as first_message_at,
  max(created_at) as last_message_at
from public.messages
where user_id is not null
group by chat_id, user_id
order by chat_id, user_id;

-- =========================================================
-- 4. chat_id -> distinct bot_username conflicts
-- Each backfilled chat must have one consistent bot_username.
-- =========================================================

select
  chat_id,
  count(distinct bot_username) as distinct_bot_username_count,
  min(created_at) as first_message_at,
  max(created_at) as last_message_at
from public.messages
where bot_username is not null
group by chat_id
having count(distinct bot_username) > 1
order by distinct_bot_username_count desc, chat_id;

-- Optional drill-down for chat_id/bot_username pairs
select
  chat_id,
  bot_username,
  count(*) as message_count,
  min(created_at) as first_message_at,
  max(created_at) as last_message_at
from public.messages
group by chat_id, bot_username
order by chat_id, bot_username;

-- =========================================================
-- 5. Importable chats summary
-- Importable chat shape:
-- - user_id is not null
-- - exactly one distinct user_id per chat_id
-- - exactly one distinct bot_username per chat_id
-- =========================================================

with chat_shapes as (
  select
    chat_id,
    count(*) as message_count,
    count(distinct user_id) filter (where user_id is not null) as distinct_user_count,
    count(distinct bot_username) filter (where bot_username is not null) as distinct_bot_username_count,
    min(created_at) as first_message_at,
    max(created_at) as last_message_at
  from public.messages
  group by chat_id
)
select
  count(*) as total_legacy_chat_ids,
  count(*) filter (
    where distinct_user_count = 1
      and distinct_bot_username_count = 1
  ) as importable_private_only_chat_ids,
  count(*) filter (
    where distinct_user_count > 1
  ) as multi_user_chat_ids,
  count(*) filter (
    where distinct_bot_username_count > 1
  ) as multi_bot_chat_ids,
  count(*) filter (
    where distinct_user_count = 0
  ) as chat_ids_without_valid_user
from chat_shapes;

-- =========================================================
-- 6. Importable clients summary
-- =========================================================

select
  count(distinct user_id) as importable_client_count
from public.messages
where user_id is not null;

-- =========================================================
-- 7. Preview of latest known non-NULL client profile snapshot
-- This preview matches the planned clients backfill rule.
-- =========================================================

with client_base as (
  select distinct
    user_id
  from public.messages
  where user_id is not null
),
last_username as (
  select distinct on (user_id)
    user_id,
    username
  from public.messages
  where user_id is not null
    and username is not null
  order by user_id, created_at desc, id desc
),
last_first_name as (
  select distinct on (user_id)
    user_id,
    first_name
  from public.messages
  where user_id is not null
    and first_name is not null
  order by user_id, created_at desc, id desc
),
last_last_name as (
  select distinct on (user_id)
    user_id,
    last_name
  from public.messages
  where user_id is not null
    and last_name is not null
  order by user_id, created_at desc, id desc
)
select
  cb.user_id as telegram_user_id,
  lu.username,
  lfn.first_name,
  lln.last_name,
  (
    select min(m.created_at)
    from public.messages m
    where m.user_id = cb.user_id
  ) as created_at,
  (
    select max(m.created_at)
    from public.messages m
    where m.user_id = cb.user_id
  ) as updated_at
from client_base cb
left join last_username lu
  on lu.user_id = cb.user_id
left join last_first_name lfn
  on lfn.user_id = cb.user_id
left join last_last_name lln
  on lln.user_id = cb.user_id
order by created_at, telegram_user_id;

-- =========================================================
-- 8. Preview of importable chats
-- Imported chats will use status = 'open'.
-- =========================================================

with importable_chat_source as (
  select
    chat_id,
    min(user_id) as legacy_user_id,
    min(bot_username) as bot_username,
    min(created_at) as created_at,
    max(created_at) as updated_at
  from public.messages
  group by chat_id
  having count(distinct user_id) filter (where user_id is not null) = 1
     and count(distinct bot_username) filter (where bot_username is not null) = 1
)
select
  ics.chat_id as telegram_chat_id,
  ics.legacy_user_id as telegram_user_id,
  ics.bot_username,
  'open'::text as imported_status,
  ics.created_at,
  ics.updated_at
from importable_chat_source ics
order by ics.created_at, ics.chat_id;
