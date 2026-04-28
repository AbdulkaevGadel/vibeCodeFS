-- Phase 2: extend chat_messages actor model for future AI/system messages.
-- Narrow schema change: only CHECK constraints on public.chat_messages.

alter table public.chat_messages
    drop constraint if exists chat_messages_sender_type_check;

alter table public.chat_messages
    add constraint chat_messages_sender_type_check
        check (sender_type in ('client', 'manager', 'ai', 'system'));

alter table public.chat_messages
    drop constraint if exists chat_messages_sender_manager_consistency_check;

alter table public.chat_messages
    add constraint chat_messages_sender_manager_consistency_check
        check (
            (sender_type = 'manager' and manager_id is not null)
            or
            (sender_type in ('client', 'ai', 'system') and manager_id is null)
        );
