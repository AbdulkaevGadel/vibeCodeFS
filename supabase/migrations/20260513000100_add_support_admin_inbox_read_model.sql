-- Phase 4: Support admin inbox read model + cursor page boundary.
--
-- Purpose:
-- - expose one compact inbox summary row per chat;
-- - provide a read-only cursor RPC for the first/next inbox pages;
-- - provide compact bot/header stats without loading full message timelines.

create or replace view public.support_admin_chat_inbox_summary
with (security_invoker = true)
as
select
    c.id,
    c.telegram_chat_id,
    c.bot_username,
    c.status,
    cl.telegram_user_id as client_telegram_user_id,
    cl.username as client_username,
    cl.first_name as client_first_name,
    cl.last_name as client_last_name,
    ca.current_manager_id as assigned_manager_id,
    m.display_name as assigned_manager_display_name,
    m.last_name as assigned_manager_last_name,
    c.last_message_at,
    lm.text as last_message_text,
    lm.sender_type as last_message_sender_type,
    c.last_read_at,
    coalesce(mc.unread_count, 0)::integer as unread_count,
    coalesce(mc.message_count, 0)::integer as message_count,
    c.created_at,
    c.updated_at
from public.chats c
join public.clients cl on cl.id = c.client_id
left join public.chat_assignments ca on ca.chat_id = c.id
left join public.managers m on m.id = ca.current_manager_id
left join lateral (
    select
        cm.text,
        cm.sender_type
    from public.chat_messages cm
    where cm.chat_id = c.id
    order by cm.created_at desc, cm.id desc
    limit 1
) lm on true
left join lateral (
    select
        count(*)::integer as message_count,
        count(*) filter (
            where cm.sender_type = 'client'
              and cm.created_at > coalesce(c.last_read_at, '-infinity'::timestamptz)
        )::integer as unread_count
    from public.chat_messages cm
    where cm.chat_id = c.id
) mc on true;

comment on view public.support_admin_chat_inbox_summary is
    'Read-only compact inbox summary for support-admin. One row per chat; no workflow mutations.';

create or replace view public.support_admin_bot_stats
with (security_invoker = true)
as
select
    s.bot_username,
    count(*)::integer as chat_count,
    coalesce(sum(s.message_count), 0)::integer as message_count
from public.support_admin_chat_inbox_summary s
group by s.bot_username;

comment on view public.support_admin_bot_stats is
    'Read-only compact support-admin stats per bot, independent from the loaded inbox page.';

create or replace function public.get_support_admin_chat_inbox_page(
    p_limit integer default 50,
    p_cursor_last_message_at timestamptz default null,
    p_cursor_created_at timestamptz default null,
    p_cursor_chat_id uuid default null,
    p_bot_username text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
    v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
    v_rows jsonb;
    v_has_more boolean;
    v_last_row record;
begin
    with page_rows as (
        select s.*
        from public.support_admin_chat_inbox_summary s
        where (p_bot_username is null or s.bot_username = p_bot_username)
          and (
            p_cursor_chat_id is null
            or (
                p_cursor_last_message_at is not null
                and (
                    (
                        s.last_message_at is not null
                        and (
                            s.last_message_at < p_cursor_last_message_at
                            or (
                                s.last_message_at = p_cursor_last_message_at
                                and (
                                    s.created_at < p_cursor_created_at
                                    or (
                                        s.created_at = p_cursor_created_at
                                        and s.id < p_cursor_chat_id
                                    )
                                )
                            )
                        )
                    )
                    or s.last_message_at is null
                )
            )
            or (
                p_cursor_last_message_at is null
                and s.last_message_at is null
                and (
                    s.created_at < p_cursor_created_at
                    or (
                        s.created_at = p_cursor_created_at
                        and s.id < p_cursor_chat_id
                    )
                )
            )
          )
        order by
            s.last_message_at desc nulls last,
            s.created_at desc,
            s.id desc
        limit v_limit + 1
    ),
    visible_rows as (
        select *
        from page_rows
        order by
            last_message_at desc nulls last,
            created_at desc,
            id desc
        limit v_limit
    )
    select
        coalesce(
            jsonb_agg(
                to_jsonb(visible_rows.*)
                order by
                    visible_rows.last_message_at desc nulls last,
                    visible_rows.created_at desc,
                    visible_rows.id desc
            ),
            '[]'::jsonb
        ),
        (select count(*) > v_limit from page_rows)
    into v_rows, v_has_more
    from visible_rows;

    select
        id,
        last_message_at,
        created_at
    into v_last_row
    from jsonb_to_recordset(v_rows) as r(
        id uuid,
        last_message_at timestamptz,
        created_at timestamptz
    )
    order by
        last_message_at desc nulls last,
        created_at desc,
        id desc
    offset greatest(jsonb_array_length(v_rows) - 1, 0)
    limit 1;

    return jsonb_build_object(
        'rows', v_rows,
        'pageInfo', jsonb_build_object(
            'hasMore', coalesce(v_has_more, false),
            'nextCursor', case
                when coalesce(v_has_more, false) and v_last_row.id is not null then
                    jsonb_build_object(
                        'lastMessageAt', v_last_row.last_message_at,
                        'createdAt', v_last_row.created_at,
                        'chatId', v_last_row.id
                    )
                else null
            end
        )
    );
end;
$$;

comment on function public.get_support_admin_chat_inbox_page(integer, timestamptz, timestamptz, uuid, text) is
    'Read-only support-admin inbox cursor page. Returns one jsonb object with rows and pageInfo.';

grant select on public.support_admin_chat_inbox_summary to authenticated;
grant select on public.support_admin_bot_stats to authenticated;
grant execute on function public.get_support_admin_chat_inbox_page(integer, timestamptz, timestamptz, uuid, text) to authenticated;
