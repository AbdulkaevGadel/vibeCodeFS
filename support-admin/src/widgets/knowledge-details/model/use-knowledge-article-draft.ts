import { useState } from "react";
import type { ArticleStatus, KnowledgeArticle } from "@/entities/knowledge-article";

export function useKnowledgeArticleDraft(selectedArticle: KnowledgeArticle | null) {
  const [title, setTitle] = useState(selectedArticle?.title ?? "");
  const [content, setContent] = useState(selectedArticle?.content ?? "");
  const [slug, setSlug] = useState(selectedArticle?.slug ?? "");
  const [status, setStatus] = useState<ArticleStatus>(selectedArticle?.status ?? "draft");

  const resetToSelectedArticle = () => {
    if (!selectedArticle) {
      return;
    }

    setTitle(selectedArticle.title);
    setContent(selectedArticle.content);
    setSlug(selectedArticle.slug);
    setStatus(selectedArticle.status);
  };

  return {
    title,
    content,
    slug,
    status,
    setTitle,
    setContent,
    setSlug,
    setStatus,
    resetToSelectedArticle,
  };
}
