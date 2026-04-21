-- Phase 6.1: Hardened Knowledge Base RPC v1 (THE IRONCLAD FINAL v1.4)

-- ==========================================
-- 1. ТАБЛИЦА MANAGERS: УЖЕСТОЧЕНИЕ КОНТРАКТА
-- ==========================================

DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM public.managers WHERE auth_user_id IS NULL) THEN
        RAISE EXCEPTION 'Found managers with NULL auth_user_id. Please fix data before migration.';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'managers_auth_user_id_key'
    ) THEN
        ALTER TABLE public.managers ADD CONSTRAINT managers_auth_user_id_key UNIQUE (auth_user_id);
    END IF;
END $$;

ALTER TABLE public.managers ALTER COLUMN auth_user_id SET NOT NULL;


-- ==========================================
-- 2. СХЕМА KB: AI-READY РАСШИРЕНИЕ
-- ==========================================

ALTER TABLE public.knowledge_base_articles 
ADD COLUMN IF NOT EXISTS content_plain TEXT,
ADD COLUMN IF NOT EXISTS content_tokens INT,
ADD COLUMN IF NOT EXISTS source_chat_id UUID REFERENCES public.chats(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS source_message_id UUID,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS archived_by_id UUID REFERENCES public.managers(id);

-- Расширяем историю для аудита
ALTER TABLE public.knowledge_base_history 
ADD COLUMN IF NOT EXISTS change_type TEXT DEFAULT 'update';

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_base_articles_slug_key'
    ) THEN
        ALTER TABLE public.knowledge_base_articles ADD CONSTRAINT knowledge_base_articles_slug_key UNIQUE (slug);
    END IF;
END $$;


-- ==========================================
-- 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (HARDENED)
-- ==========================================

-- Хелпер для ID менеджера
CREATE OR REPLACE FUNCTION public.get_current_manager_id_v1()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    SELECT id INTO v_id FROM public.managers WHERE auth_user_id = auth.uid() LIMIT 1;
    IF v_id IS NULL THEN RAISE EXCEPTION 'MANAGER_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    RETURN v_id;
END;
$$;

-- Хелпер для проверки прав админа/супра (SECURITY DEFINER ПРИМЕНЕН)
CREATE OR REPLACE FUNCTION public.is_admin_v1()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN COALESCE(
        (SELECT role IN ('admin', 'supervisor') FROM public.managers WHERE auth_user_id = auth.uid() LIMIT 1), 
        false
    );
END;
$$;

-- Настройка прав для хелперов
ALTER FUNCTION public.get_current_manager_id_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_current_manager_id_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_manager_id_v1() TO authenticated;

ALTER FUNCTION public.is_admin_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_admin_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_v1() TO authenticated;


-- ==========================================
-- 4. ЭЛИТНЫЙ СЛОЙ: RPC GATEKEEPERS (v1)
-- ==========================================

-- Функция создания статьи
CREATE OR REPLACE FUNCTION public.create_kb_article_v1(
    p_title TEXT,
    p_content TEXT,
    p_slug TEXT,
    p_status public.article_status DEFAULT 'draft',
    p_source_chat_id UUID DEFAULT NULL
)
RETURNS public.knowledge_base_articles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_manager_id UUID;
    v_final_slug TEXT;
    v_result public.knowledge_base_articles;
BEGIN
    v_manager_id := public.get_current_manager_id_v1();
    
    -- Идеальный генератор слагов (v1.4)
    FOR i IN 0..10 LOOP
        v_final_slug := lower(trim(p_slug)) || CASE WHEN i = 0 THEN '' ELSE '-' || i END;
        IF NOT EXISTS (SELECT 1 FROM public.knowledge_base_articles WHERE slug = v_final_slug) THEN
            EXIT;
        END IF;
        IF i = 10 THEN
            RAISE EXCEPTION 'SLUG_GENERATION_FAILED' USING ERRCODE = 'P0003';
        END IF;
    END LOOP;

    INSERT INTO public.knowledge_base_articles (
        title, content, slug, status, source_chat_id, 
        created_by_id, updated_by_id,
        content_plain, content_tokens,
        archived_at, archived_by_id
    ) VALUES (
        p_title, p_content, v_final_slug, p_status, p_source_chat_id,
        v_manager_id, v_manager_id,
        p_content, COALESCE(length(p_content), 0) / 4,
        CASE WHEN p_status = 'archived' THEN now() ELSE NULL END,
        CASE WHEN p_status = 'archived' THEN v_manager_id ELSE NULL END
    )
    RETURNING * INTO v_result;

    INSERT INTO public.knowledge_base_history (
        article_id, title, content, version, status, updated_by_id, change_type
    ) VALUES (
        v_result.id, v_result.title, v_result.content, v_result.version, v_result.status, v_manager_id, 'create'
    );

    RETURN v_result;
END;
$$;

-- Настройка прав
ALTER FUNCTION public.create_kb_article_v1(TEXT, TEXT, TEXT, public.article_status, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_kb_article_v1(TEXT, TEXT, TEXT, public.article_status, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_kb_article_v1(TEXT, TEXT, TEXT, public.article_status, UUID) TO authenticated;


-- Функция обновления статьи (v1.4 с улучшенным COALESCE)
CREATE OR REPLACE FUNCTION public.update_kb_article_v1(
    p_id UUID,
    p_title TEXT DEFAULT NULL,
    p_content TEXT DEFAULT NULL,
    p_slug TEXT DEFAULT NULL,
    p_status public.article_status DEFAULT NULL,
    p_version INT DEFAULT NULL
)
RETURNS public.knowledge_base_articles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_manager_id UUID;
    v_final_slug TEXT;
    v_result public.knowledge_base_articles;
    v_is_admin BOOLEAN;
    v_change_type TEXT := 'update';
BEGIN
    v_manager_id := public.get_current_manager_id_v1();
    v_is_admin := public.is_admin_v1();

    -- Генератор слагов для UPDATE
    IF p_slug IS NOT NULL THEN
        FOR i IN 0..10 LOOP
            v_final_slug := lower(trim(p_slug)) || CASE WHEN i = 0 THEN '' ELSE '-' || i END;
            IF NOT EXISTS (SELECT 1 FROM public.knowledge_base_articles WHERE slug = v_final_slug AND id != p_id) THEN
                EXIT;
            END IF;
        END LOOP;
    END IF;

    -- Атомарный UPDATE v1.4
    UPDATE public.knowledge_base_articles
    SET 
        title = COALESCE(p_title, title),
        content = COALESCE(p_content, content),
        content_plain = COALESCE(p_content, content),
        content_tokens = COALESCE(length(COALESCE(p_content, content)), 0) / 4,
        slug = COALESCE(v_final_slug, slug),
        status = COALESCE(p_status, status),
        updated_by_id = v_manager_id,
        version = version + 1,
        archived_at = CASE 
            WHEN COALESCE(p_status, status) = 'archived' AND archived_at IS NULL THEN now()
            WHEN COALESCE(p_status, status) != 'archived' THEN NULL
            ELSE archived_at
        END,
        archived_by_id = CASE 
            WHEN COALESCE(p_status, status) = 'archived' AND archived_by_id IS NULL THEN v_manager_id
            WHEN COALESCE(p_status, status) != 'archived' THEN NULL
            ELSE archived_by_id
        END,
        updated_at = now()
    WHERE id = p_id 
      AND (p_version IS NULL OR version = p_version)
      AND (created_by_id = v_manager_id OR v_is_admin)
    RETURNING * INTO v_result;

    IF NOT FOUND THEN
        IF EXISTS (SELECT 1 FROM public.knowledge_base_articles WHERE id = p_id) THEN
            RAISE EXCEPTION 'VERSION_CONFLICT_OR_FORBIDDEN' USING ERRCODE = 'P0001';
        ELSE
            RAISE EXCEPTION 'ARTICLE_NOT_FOUND' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    -- Логика определения типа изменения (Smart Change Type)
    IF p_status IS NOT NULL AND p_title IS NULL AND p_content IS NULL THEN
        v_change_type := 'status_change';
    END IF;

    INSERT INTO public.knowledge_base_history (
        article_id, title, content, version, status, updated_by_id, change_type
    ) VALUES (
        v_result.id, v_result.title, v_result.content, v_result.version, v_result.status, v_manager_id, v_change_type
    );

    RETURN v_result;
END;
$$;

-- Настройка прав
ALTER FUNCTION public.update_kb_article_v1(UUID, TEXT, TEXT, TEXT, public.article_status, INT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_kb_article_v1(UUID, TEXT, TEXT, TEXT, public.article_status, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_kb_article_v1(UUID, TEXT, TEXT, TEXT, public.article_status, INT) TO authenticated;


-- Функция архивации (v1.4 - Исключена лишняя логика)
CREATE OR REPLACE FUNCTION public.archive_kb_article_v1(p_id UUID, p_version INT)
RETURNS public.knowledge_base_articles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN public.update_kb_article_v1(p_id => p_id, p_status => 'archived'::public.article_status, p_version => p_version);
END; $$;

-- Функция восстановления
CREATE OR REPLACE FUNCTION public.restore_kb_article_v1(p_id UUID, p_version INT)
RETURNS public.knowledge_base_articles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN public.update_kb_article_v1(p_id => p_id, p_status => 'published'::public.article_status, p_version => p_version);
END; $$;

-- Настройка прав жизненного цикла
ALTER FUNCTION public.archive_kb_article_v1(UUID, INT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.archive_kb_article_v1(UUID, INT) TO authenticated;
ALTER FUNCTION public.restore_kb_article_v1(UUID, INT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.restore_kb_article_v1(UUID, INT) TO authenticated;


-- ==========================================
-- 5. ИНДЕКСЫ (PERFORMANCE)
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_kb_active_cursor ON public.knowledge_base_articles (created_at DESC, id DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kb_author_lookup ON public.knowledge_base_articles (created_by_id, created_at DESC);


-- ==========================================
-- 6. RLS (ACCESS LAYER)
-- ==========================================

DROP POLICY IF EXISTS "Managers can read articles v5" ON public.knowledge_base_articles;
CREATE POLICY "Managers can read articles v6" ON public.knowledge_base_articles
    FOR SELECT TO authenticated
    USING (
        (archived_at IS NULL) OR 
        (created_by_id = public.get_current_manager_id_v1()) OR
        (public.is_admin_v1())
    );
