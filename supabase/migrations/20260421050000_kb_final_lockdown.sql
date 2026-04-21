-- Phase 6.4: THE IRONCLAD FINAL LOCKDOWN (v3)

-- 1. Гарантируем включение RLS
ALTER TABLE public.knowledge_base_articles ENABLE ROW LEVEL SECURITY;

-- 2. Вспомогательная функция для БЕЗОПАСНОГО получения ID менеджера в RLS
-- В отличие от основной версии, эта не кидает EXCEPTION, а возвращает NULL.
-- Это критично для того, чтобы SELECT не падал с ошибкой для анонимов или новых юзеров.
CREATE OR REPLACE FUNCTION public.get_current_manager_id_safe_v1()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM public.managers WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

ALTER FUNCTION public.get_current_manager_id_safe_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_current_manager_id_safe_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_manager_id_safe_v1() TO authenticated;

-- 3. Полная зачистка всех старых разрешающих политик
DROP POLICY IF EXISTS "Managers can insert articles" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "Managers can update articles" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "Managers can delete articles" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "Managers can read articles" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "Managers can read articles v6" ON public.knowledge_base_articles;

-- 4. ОФИЦИАЛЬНАЯ ПОЛИТИКА ЧТЕНИЯ (v3 - Strict & Safe)
-- Мы показываем только Published, либо свои черновики, либо всё - админам.
CREATE POLICY "KB_SELECT_POLICY_FINAL" ON public.knowledge_base_articles
    FOR SELECT TO authenticated
    USING (
        (status = 'published') OR 
        (created_by_id = public.get_current_manager_id_safe_v1()) OR
        (public.is_admin_v1())
    );

-- 5. ЯВНЫЙ ЗАПРЕТ НА ЛЮБЫЕ МУТАЦИИ (Explicit Paranoid Lockdown)
-- Теперь ни INSERT, ни UPDATE, ни DELETE не пройдут мимо RPC.

CREATE POLICY "KB_INSERT_DENY" ON public.knowledge_base_articles
    FOR INSERT TO authenticated
    WITH CHECK (false);

CREATE POLICY "KB_UPDATE_DENY" ON public.knowledge_base_articles
    FOR UPDATE TO authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY "KB_DELETE_DENY" ON public.knowledge_base_articles
    FOR DELETE TO authenticated
    USING (false);

-- Финальный аккорд: база теперь полностью изолирована.
COMMENT ON TABLE public.knowledge_base_articles IS 'Ironclad Knowledge Base. All mutations restricted to RPC v1 API.';
