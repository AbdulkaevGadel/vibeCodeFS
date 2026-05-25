export type ArticleStatus = "draft" | "published" | "archived";

export type KnowledgeBaseView = "active" | "archive";

export type ArticleEmbeddingStatus = "actual" | "outdated" | "updating" | "failed" | "unavailable";

export type KnowledgeEmbeddingSummary = {
  totalCount: number;
  publishedCount: number;
  actualCount: number;
  outdatedCount: number;
  updatingCount: number;
  failedCount: number;
  unavailableCount: number;
  refreshableCount: number;
};

export type KnowledgeEmbeddingRefreshBatchStatus = "running" | "completed" | "completed_with_errors" | "failed";

export type KnowledgeEmbeddingRefreshBatchItemStatus = "pending" | "processing" | "completed" | "failed" | "skipped";

export type KnowledgeEmbeddingRefreshBatchItem = {
  id: string;
  articleId: string;
  articleTitle: string;
  articleVersion: number;
  status: KnowledgeEmbeddingRefreshBatchItemStatus;
  resultType: string | null;
  errorMessage: string | null;
  processedAt: string | null;
};

export type KnowledgeEmbeddingRefreshBatch = {
  id: string;
  status: KnowledgeEmbeddingRefreshBatchStatus;
  totalCount: number;
  processedCount: number;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  items: KnowledgeEmbeddingRefreshBatchItem[];
};

export type KnowledgeArticle = {
  id: string;
  slug: string;
  title: string;
  content: string;
  status: ArticleStatus;
  version: number;
  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  archivedById: string | null;
  embeddingStatus: ArticleEmbeddingStatus;
  embeddingChunkSetId: string | null;
  embeddingErrorMessage: string | null;
};

export type KnowledgeArticleHistory = {
  id: string;
  articleId: string;
  title: string;
  content: string;
  version: number;
  changeType: "create" | "update" | "publish" | "unpublish" | "archive" | "restore";
  changedById: string | null;
  changedAt: string;
};
