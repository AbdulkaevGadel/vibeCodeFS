-- Fix KB history read policy.
-- managers.id is a support-domain id, auth.uid() is auth.users.id.
-- The policy must check managers.auth_user_id.

drop policy if exists "Managers can read history" on public.knowledge_base_history;
drop policy if exists "KB_HISTORY_SELECT_POLICY_FINAL" on public.knowledge_base_history;

create policy "KB_HISTORY_SELECT_POLICY_FINAL" on public.knowledge_base_history
    for select to authenticated
    using (
        exists (
            select 1
            from public.managers
            where auth_user_id = auth.uid()
        )
    );
