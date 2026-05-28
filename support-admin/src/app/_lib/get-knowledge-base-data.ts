import {createSupabaseServerClient} from "@/shared/api/supabase/server-client";
import {
  isPrivilegedManager,
  type Manager,
} from "@/entities/manager";
import {
  emptyKnowledgeEmbeddingSummary,
  type KnowledgeArticle,
  type KnowledgeArticleHistory,
  type KnowledgeBaseView,
  type KnowledgeEmbeddingRefreshBatch,
  type KnowledgeEmbeddingSummary,
} from "@/entities/knowledge-article";
import { getCurrentManager } from "@/entities/manager/api/current-manager";
import {
  loadKnowledgeArticles,
  loadSelectedKnowledgeArticleDetails,
} from "./knowledge-base-data/articles";
import {
  loadKnowledgeEmbeddingRefreshBatch,
  loadKnowledgeEmbeddingSummary,
} from "./knowledge-base-data/embeddings";
import { loadKnowledgeManagers } from "./knowledge-base-data/managers";
import type { KnowledgeBasePageData } from "./knowledge-base-data/types";

export type { KnowledgeBasePageData } from "./knowledge-base-data/types";

export async function getKnowledgeBaseData(
  selectedId?: string | null,
  searchQuery?: string | null,
  requestedView: KnowledgeBaseView = "active",
): Promise<KnowledgeBasePageData> {
  let articles: KnowledgeArticle[] = [];
  let selectedArticle: KnowledgeArticle | null = null;
  let history: KnowledgeArticleHistory[] = [];
  let currentManager: Manager | null = null;
  let view: KnowledgeBaseView = "active";
  let allManagers: Manager[] = [];
  let embeddingSummary: KnowledgeEmbeddingSummary = emptyKnowledgeEmbeddingSummary;
  let embeddingRefreshBatch: KnowledgeEmbeddingRefreshBatch | null = null;
  let errorMessage: string | null = null;

  try {
    const supabase = await createSupabaseServerClient();

    [
      currentManager,
      allManagers,
      embeddingSummary,
      embeddingRefreshBatch,
    ] = await Promise.all([
      getCurrentManager().catch(() => null),
      loadKnowledgeManagers(supabase),
      loadKnowledgeEmbeddingSummary(supabase),
      loadKnowledgeEmbeddingRefreshBatch(supabase),
    ]);

    view = resolveKnowledgeBaseView(requestedView, currentManager);

    const articlesResult = await loadKnowledgeArticles(supabase, view, searchQuery);

    if (articlesResult.errorMessage) {
      errorMessage = articlesResult.errorMessage;
    } else {
      articles = articlesResult.articles;
    }

    if (selectedId && !errorMessage) {
      const selectedArticleDetails = await loadSelectedKnowledgeArticleDetails(
        supabase,
        articles,
        selectedId,
      );

      selectedArticle = selectedArticleDetails.selectedArticle;
      history = selectedArticleDetails.history;
    }
  } catch (err: unknown) {
    console.error("KB Data loading error:", err);
    errorMessage = "Ошибка при загрузке данных Базы Знаний.";
  }

  return {
    articles,
    selectedArticle,
    history,
    currentManager,
    allManagers,
    view,
    totalCount: articles.length,
    publishedCount: articles.filter((article) => article.status === "published").length,
    embeddingSummary,
    embeddingRefreshBatch,
    errorMessage,
  };
}

function resolveKnowledgeBaseView(
  requestedView: KnowledgeBaseView,
  currentManager: Manager | null,
): KnowledgeBaseView {
  return requestedView === "archive" && isPrivilegedManager(currentManager) ? "archive" : "active";
}
