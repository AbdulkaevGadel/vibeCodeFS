-- Phase 6: Knowledge Base Foundation (v7.0 - IRONCLAD MAX)

-- 1. Типы
CREATE TYPE public.article_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE public.kb_change_type AS ENUM ('create', 'update', 'publish', 'unpublish', 'archive', 'restore');

-- 2. Таблицы
CREATE TABLE public.knowledge_base_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    status public.article_status NOT NULL DEFAULT 'draft',
    version INT NOT NULL DEFAULT 1 CHECK (version > 0),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by_id UUID NOT NULL REFERENCES public.managers(id) ON DELETE RESTRICT,
    updated_by_id UUID NOT NULL REFERENCES public.managers(id) ON DELETE RESTRICT,
    
    archived_at TIMESTAMPTZ,
    archived_by_id UUID REFERENCES public.managers(id) ON DELETE SET NULL,
    
    -- Полнотекстовый поиск с весами
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('russian', coalesce(title, '')), 'A') || 
        setweight(to_tsvector('russian', coalesce(content, '')), 'B')
    ) STORED,

    CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9-]+$'),
    CONSTRAINT slug_length CHECK (length(slug) <= 100),
    CONSTRAINT title_length CHECK (length(title) >= 3),
    CONSTRAINT content_length CHECK (length(content) <= 50000),
    -- Гарантия консистентности архива
    CONSTRAINT archive_consistency CHECK (
        (status = 'archived' AND archived_at IS NOT NULL AND archived_by_id IS NOT NULL) OR
        (status != 'archived' AND archived_at IS NULL AND archived_by_id IS NULL)
    )
);

CREATE TABLE public.knowledge_base_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES public.knowledge_base_articles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    version INT NOT NULL,
    change_type public.kb_change_type NOT NULL,
    changed_by_id UUID REFERENCES public.managers(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Индексы
CREATE INDEX idx_kb_search ON public.knowledge_base_articles USING GIN (search_vector);
CREATE UNIQUE INDEX idx_kb_slug_active ON public.knowledge_base_articles (slug) WHERE status != 'archived';
CREATE INDEX idx_kb_cursor ON public.knowledge_base_articles (status, updated_at DESC, id DESC);
CREATE INDEX idx_kb_history_article_time ON public.knowledge_base_history (article_id, changed_at DESC);

-- 4. Функции
CREATE OR REPLACE FUNCTION public.fn_kb_main_logic()
RETURNS TRIGGER AS $$
BEGIN
    -- Slug всегда в нижний регистр
    NEW.slug := lower(NEW.slug);

    IF (TG_OP = 'UPDATE') THEN
        -- No-Op проверка: если ничего важного не изменилось — выходим
        IF (NEW.title IS NOT DISTINCT FROM OLD.title AND 
            NEW.content IS NOT DISTINCT FROM OLD.content AND 
            NEW.status IS NOT DISTINCT FROM OLD.status AND
            NEW.slug IS NOT DISTINCT FROM OLD.slug) THEN
            RETURN NEW;
        END IF;

        -- Логика переключения архива в триггере
        IF (NEW.status = 'archived' AND OLD.status != 'archived') THEN
            NEW.archived_at := now();
            NEW.archived_by_id := auth.uid();
        ELSIF (NEW.status != 'archived' AND OLD.status = 'archived') THEN
            NEW.archived_at := NULL;
            NEW.archived_by_id := NULL;
        END IF;

        NEW.updated_at := now();
        NEW.updated_by_id := auth.uid();
    END IF;

    IF (TG_OP = 'INSERT') THEN
        NEW.created_by_id := auth.uid();
        NEW.updated_by_id := auth.uid();
        NEW.created_at := now();
        NEW.updated_at := now();
        
        -- Если создаем сразу в архиве (редко, но возможно)
        IF (NEW.status = 'archived') THEN
            NEW.archived_at := now();
            NEW.archived_by_id := auth.uid();
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.fn_kb_log_history()
RETURNS TRIGGER AS $$
DECLARE
    v_change_type public.kb_change_type;
BEGIN
    -- Защита от лишних записей в историю (No-op)
    IF (TG_OP = 'UPDATE') THEN
        IF (NEW.title IS NOT DISTINCT FROM OLD.title AND 
            NEW.content IS NOT DISTINCT FROM OLD.content AND 
            NEW.status IS NOT DISTINCT FROM OLD.status AND
            NEW.slug IS NOT DISTINCT FROM OLD.slug) THEN
            RETURN NEW;
        END IF;
    END IF;

    IF (TG_OP = 'INSERT') THEN
        v_change_type := 'create';
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (NEW.status = 'published' AND OLD.status = 'draft') THEN v_change_type := 'publish';
        ELSIF (NEW.status = 'draft' AND OLD.status = 'published') THEN v_change_type := 'unpublish';
        ELSIF (NEW.status = 'archived' AND OLD.status != 'archived') THEN v_change_type := 'archive';
        ELSIF (NEW.status != 'archived' AND OLD.status = 'archived') THEN v_change_type := 'restore';
        ELSE v_change_type := 'update';
        END IF;
    END IF;

    INSERT INTO public.knowledge_base_history (
        article_id, title, content, version, change_type, changed_by_id
    ) VALUES (
        NEW.id, NEW.title, NEW.content, NEW.version, v_change_type, auth.uid()
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Триггеры
CREATE TRIGGER tr_kb_main_stamp
    BEFORE INSERT OR UPDATE ON public.knowledge_base_articles
    FOR EACH ROW EXECUTE FUNCTION public.fn_kb_main_logic();

CREATE TRIGGER tr_kb_history_log
    AFTER INSERT OR UPDATE ON public.knowledge_base_articles
    FOR EACH ROW EXECUTE FUNCTION public.fn_kb_log_history();

-- 6. Безопасность
ALTER TABLE public.knowledge_base_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_history ENABLE ROW LEVEL SECURITY;

-- Права на вставку в историю только у триггера
REVOKE ALL ON public.knowledge_base_history FROM anon, authenticated, public;
GRANT SELECT ON public.knowledge_base_history TO authenticated;

-- Статьи
CREATE POLICY "Managers can read articles" ON public.knowledge_base_articles
    FOR SELECT USING (
        (status != 'archived') OR 
        (EXISTS (SELECT 1 FROM public.managers WHERE id = auth.uid() AND role IN ('admin', 'supervisor')))
    );

CREATE POLICY "Managers can insert articles" ON public.knowledge_base_articles
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.managers WHERE id = auth.uid()));

CREATE POLICY "Managers can update articles" ON public.knowledge_base_articles
    FOR UPDATE 
    USING (EXISTS (SELECT 1 FROM public.managers WHERE id = auth.uid()))
    WITH CHECK (
        (status != 'archived') OR 
        (EXISTS (SELECT 1 FROM public.managers WHERE id = auth.uid() AND role IN ('admin', 'supervisor')))
    );

CREATE POLICY "Managers can read history" ON public.knowledge_base_history
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.managers WHERE id = auth.uid()));
