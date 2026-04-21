-- Phase 6.3: KB History Schema Fix (FIX-v2)

-- 1. Добавляем недостающее поле status в таблицу истории
ALTER TABLE public.knowledge_base_history 
ADD COLUMN IF NOT EXISTS status public.article_status;

-- 2. Исправляем имена колонок в истории (changed_by_id вместо updated_by_id)
-- Мы не будем переименовывать колонку в таблице, а просто исправим RPC.

-- 3. Обновляем RPC создания (create_kb_article_v1)
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

    -- ИСПРАВЛЕНО: changed_by_id и добавление status
    INSERT INTO public.knowledge_base_history (
        article_id, title, content, version, status, changed_by_id, change_type
    ) VALUES (
        v_result.id, v_result.title, v_result.content, v_result.version, v_result.status, v_manager_id, 'create'
    );

    RETURN v_result;
END;
$$;

-- 4. Обновляем RPC обновления (update_kb_article_v1)
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
    v_change_type public.kb_change_type := 'update'; -- Используем оригинальный ENUM
BEGIN
    v_manager_id := public.get_current_manager_id_v1();
    v_is_admin := public.is_admin_v1();

    IF p_slug IS NOT NULL THEN
        FOR i IN 0..10 LOOP
            v_final_slug := lower(trim(p_slug)) || CASE WHEN i = 0 THEN '' ELSE '-' || i END;
            IF NOT EXISTS (SELECT 1 FROM public.knowledge_base_articles WHERE slug = v_final_slug AND id != p_id) THEN
                EXIT;
            END IF;
        END LOOP;
    END IF;

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

    -- Логика маппинга на оригинальный ENUM
    IF p_status IS NOT NULL AND p_title IS NULL AND p_content IS NULL THEN
        IF p_status = 'archived' THEN v_change_type := 'archive';
        ELSIF p_status = 'published' THEN v_change_type := 'publish';
        ELSE v_change_type := 'update';
        END IF;
    END IF;

    -- ИСПРАВЛЕНО: changed_by_id и добавление status
    INSERT INTO public.knowledge_base_history (
        article_id, title, content, version, status, changed_by_id, change_type
    ) VALUES (
        v_result.id, v_result.title, v_result.content, v_result.version, v_result.status, v_manager_id, v_change_type
    );

    RETURN v_result;
END;
$$;
