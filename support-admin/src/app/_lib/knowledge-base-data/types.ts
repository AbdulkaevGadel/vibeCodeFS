import type { createSupabaseServerClient } from "@/shared/api/supabase/server-client";
import type { Manager } from "@/entities/manager";
import type {
  KnowledgeArticle,
  KnowledgeArticleHistory,
  KnowledgeBaseView,
  KnowledgeEmbeddingRefreshBatch,
  KnowledgeEmbeddingSummary,
} from "@/entities/knowledge-article";

export type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type KnowledgeBasePageData = {
  articles: KnowledgeArticle[];
  selectedArticle: KnowledgeArticle | null;
  history: KnowledgeArticleHistory[];
  currentManager: Manager | null;
  allManagers: Manager[];
  view: KnowledgeBaseView;
  totalCount: number;
  publishedCount: number;
  embeddingSummary: KnowledgeEmbeddingSummary;
  embeddingRefreshBatch: KnowledgeEmbeddingRefreshBatch | null;
  errorMessage: string | null;
};
