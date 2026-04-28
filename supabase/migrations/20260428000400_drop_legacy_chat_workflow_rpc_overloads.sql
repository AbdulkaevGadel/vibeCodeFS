-- Phase 4 cleanup: remove legacy overloaded RPC signatures.
-- The active signatures are:
-- - public.take_chat_into_work(p_chat_id uuid)
-- - public.update_chat_status(p_chat_id uuid, p_new_status varchar, p_expected_status varchar default null)

drop function if exists public.take_chat_into_work(uuid, uuid);

drop function if exists public.update_chat_status(uuid, varchar);
