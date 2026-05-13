-- Phase 4 verification: support-admin inbox read model + cursor boundary.
-- Run after applying migration 20260513000100_add_support_admin_inbox_read_model.sql.
-- These checks are read-only.

-- 1. View returns one compact row per chat.
select
    (select count(*) from public.chats) as chats_count,
    (select count(*) from public.support_admin_chat_inbox_summary) as summary_count;

-- 2. Inspect summary shape and ordering.
select
    id,
    telegram_chat_id,
    bot_username,
    status,
    client_telegram_user_id,
    client_username,
    assigned_manager_id,
    assigned_manager_display_name,
    last_message_at,
    last_message_text,
    last_message_sender_type,
    last_read_at,
    unread_count,
    message_count,
    created_at,
    updated_at
from public.support_admin_chat_inbox_summary
order by last_message_at desc nulls last, created_at desc, id desc
limit 10;

-- 3. Bot/header stats are independent from the first inbox page.
select
    bot_username,
    chat_count,
    message_count
from public.support_admin_bot_stats
order by bot_username;

-- 4. First page returns a single jsonb page contract.
select public.get_support_admin_chat_inbox_page(5, null, null, null, null) as first_page;

-- 5. Next page check for the default-sized page.
-- If hasMore=false, this must report a skip instead of calling the first page again.
with first_page as (
    select public.get_support_admin_chat_inbox_page(5, null, null, null, null) as page
),
cursor_value as (
    select
        (page #>> '{pageInfo,hasMore}')::boolean as has_more,
        page #> '{pageInfo,nextCursor}' as cursor
    from first_page
)
select case
    when has_more and cursor <> 'null'::jsonb then public.get_support_admin_chat_inbox_page(
        5,
        nullif(cursor->>'lastMessageAt', '')::timestamptz,
        (cursor->>'createdAt')::timestamptz,
        (cursor->>'chatId')::uuid,
        null
    )
    else jsonb_build_object(
        'skipped', true,
        'reason', 'first page has no next cursor'
    )
end as next_page
from cursor_value;

-- 6. Boundary duplicate check between first and next page.
-- Uses limit=1 so the current small dataset can still exercise a real cursor boundary.
with first_page as (
    select public.get_support_admin_chat_inbox_page(1, null, null, null, null) as page
),
cursor_value as (
    select
        page,
        (page #>> '{pageInfo,hasMore}')::boolean as has_more,
        page #> '{pageInfo,nextCursor}' as cursor
    from first_page
),
next_page as (
    select public.get_support_admin_chat_inbox_page(
        1,
        nullif(cursor->>'lastMessageAt', '')::timestamptz,
        (cursor->>'createdAt')::timestamptz,
        (cursor->>'chatId')::uuid,
        null
    ) as page
    from cursor_value
    where has_more
      and cursor <> 'null'::jsonb
),
first_ids as (
    select row->>'id' as id
    from first_page, jsonb_array_elements(page->'rows') row
),
next_ids as (
    select row->>'id' as id
    from next_page, jsonb_array_elements(page->'rows') row
)
select
    coalesce(jsonb_agg(first_ids.id), '[]'::jsonb) as duplicate_ids
from first_ids
join next_ids using (id);

-- 7. Bot-scoped page verifies that bot filtering happens before limit/cursor.
select public.get_support_admin_chat_inbox_page(
    5,
    null,
    null,
    null,
    (select bot_username from public.support_admin_bot_stats order by bot_username limit 1)
) as first_bot_page;

-- 8. Access metadata sanity check.
select
    routine_name,
    security_type
from information_schema.routines
where specific_schema = 'public'
  and routine_name = 'get_support_admin_chat_inbox_page';
