create index chats_client_id_idx
    on public.chats (client_id);

create index chats_bot_username_idx
    on public.chats (bot_username);

create index chats_status_created_at_idx
    on public.chats (status, created_at);

create index chat_assignments_current_manager_id_idx
    on public.chat_assignments (current_manager_id);

create index assignment_history_chat_id_idx
    on public.assignment_history (chat_id);

create index assignment_history_to_manager_id_idx
    on public.assignment_history (to_manager_id);

create index assignment_history_created_at_idx
    on public.assignment_history (created_at);

create index chat_status_history_chat_id_idx
    on public.chat_status_history (chat_id);

create index chat_status_history_created_at_idx
    on public.chat_status_history (created_at);
