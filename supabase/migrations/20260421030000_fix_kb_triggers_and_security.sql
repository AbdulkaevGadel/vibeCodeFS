-- Phase 6.2: KB Cleanup & Security Hardening (FIX-v1)

-- 1. Удаляем старые триггеры, которые конфликтовали с RPC (причина FK Error)
-- Эти триггеры перезаписывали manager_id системным auth.uid(), что ломало FK constraint.
DROP TRIGGER IF EXISTS tr_kb_main_stamp ON public.knowledge_base_articles;
DROP TRIGGER IF EXISTS tr_kb_history_log ON public.knowledge_base_articles;

-- 2. Обновляем хелпер проверки админа (Elite version с EXISTS и SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_admin_v1()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.managers 
        WHERE auth_user_id = auth.uid() 
          AND role IN ('admin', 'supervisor')
    );
END;
$$;

-- Настройка прав доступа для хелпера
ALTER FUNCTION public.is_admin_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_admin_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_v1() TO authenticated;

-- Комментарий для будущих аудитов
COMMENT ON FUNCTION public.is_admin_v1() IS 'Checks if the current auth user is a manager with elevated roles. Security definer used to bypass RLS on managers table.';
