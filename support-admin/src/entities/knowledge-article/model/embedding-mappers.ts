import type {
  ArticleEmbeddingStatus,
  KnowledgeArticle,
  KnowledgeEmbeddingRefreshBatch,
  KnowledgeEmbeddingRefreshBatchItemStatus,
  KnowledgeEmbeddingRefreshBatchStatus,
  KnowledgeEmbeddingSummary,
} from "./types";

export const emptyKnowledgeEmbeddingSummary: KnowledgeEmbeddingSummary = {
  totalCount: 0,
  publishedCount: 0,
  actualCount: 0,
  outdatedCount: 0,
  updatingCount: 0,
  failedCount: 0,
  unavailableCount: 0,
  refreshableCount: 0,
};

const articleEmbeddingStatuses = [
  "actual",
  "outdated",
  "updating",
  "failed",
  "unavailable",
] as const satisfies readonly ArticleEmbeddingStatus[];

type EmbeddingRefreshBatchRow = {
  id: string;
  status: KnowledgeEmbeddingRefreshBatchStatus;
  total_count: number;
  processed_count: number;
  completed_count: number;
  failed_count: number;
  skipped_count: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
};

type EmbeddingRefreshBatchItemRow = {
  id: string;
  article_id: string;
  article_title: string;
  article_version: number;
  status: KnowledgeEmbeddingRefreshBatchItemStatus;
  result_type: string | null;
  error_message: string | null;
  processed_at: string | null;
};

type EmbeddingRefreshBatchRpcResponse = {
  batch?: EmbeddingRefreshBatchRow | null;
  items?: EmbeddingRefreshBatchItemRow[] | null;
};

export function mapKnowledgeArticleEmbeddingState(
  value: unknown,
): Pick<KnowledgeArticle, "embeddingStatus" | "embeddingChunkSetId" | "embeddingErrorMessage"> {
  const state = isRecord(value) ? value : null;
  const rawStatus = state?.embedding_status;
  const embeddingStatus = isArticleEmbeddingStatus(rawStatus) ? rawStatus : "unavailable";

  return {
    embeddingStatus,
    embeddingChunkSetId: typeof state?.chunk_set_id === "string" ? state.chunk_set_id : null,
    embeddingErrorMessage: typeof state?.error_message === "string" && state.error_message.trim()
      ? state.error_message
      : null,
  };
}

export function mapKnowledgeEmbeddingSummary(value: unknown): KnowledgeEmbeddingSummary {
  const summary = isRecord(value) ? value : null;

  return {
    totalCount: readNumber(summary?.total_count),
    publishedCount: readNumber(summary?.published_count),
    actualCount: readNumber(summary?.actual_count),
    outdatedCount: readNumber(summary?.outdated_count),
    updatingCount: readNumber(summary?.updating_count),
    failedCount: readNumber(summary?.failed_count),
    unavailableCount: readNumber(summary?.unavailable_count),
    refreshableCount: readNumber(summary?.refreshable_count),
  };
}

export function mapKnowledgeEmbeddingRefreshBatch(value: unknown): KnowledgeEmbeddingRefreshBatch | null {
  const response = isEmbeddingRefreshBatchRpcResponse(value) ? value : null;
  const batch = response?.batch;

  if (!batch || typeof batch !== "object") {
    return null;
  }

  const items = response.items ?? [];

  return {
    id: String(batch.id),
    status: batch.status,
    totalCount: readNumber(batch.total_count),
    processedCount: readNumber(batch.processed_count),
    completedCount: readNumber(batch.completed_count),
    failedCount: readNumber(batch.failed_count),
    skippedCount: readNumber(batch.skipped_count),
    startedAt: String(batch.started_at),
    completedAt: typeof batch.completed_at === "string" ? batch.completed_at : null,
    errorMessage: typeof batch.error_message === "string" ? batch.error_message : null,
    items: items.map((item) => ({
      id: String(item.id),
      articleId: String(item.article_id),
      articleTitle: String(item.article_title),
      articleVersion: readNumber(item.article_version),
      status: item.status,
      resultType: typeof item.result_type === "string" ? item.result_type : null,
      errorMessage: typeof item.error_message === "string" ? item.error_message : null,
      processedAt: typeof item.processed_at === "string" ? item.processed_at : null,
    })),
  };
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArticleEmbeddingStatus(value: unknown): value is ArticleEmbeddingStatus {
  return typeof value === "string" && articleEmbeddingStatuses.includes(value as ArticleEmbeddingStatus);
}

function isEmbeddingRefreshBatchRpcResponse(value: unknown): value is EmbeddingRefreshBatchRpcResponse {
  if (!isRecord(value)) return false;

  const items = value.items;
  return items === undefined || items === null || Array.isArray(items);
}
