import {createSupabaseServerClient} from "@/lib/supabase-server";
import {getCurrentManager} from "./manager-utils";
import {
  ArticleEmbeddingStatus,
  ArticleStatus,
  KnowledgeEmbeddingRefreshBatchItemStatus,
  KnowledgeEmbeddingRefreshBatchStatus,
  KnowledgeArticle,
  KnowledgeArticleHistory,
  KnowledgeBaseView,
  KnowledgeEmbeddingRefreshBatch,
  KnowledgeEmbeddingSummary,
  Manager,
  coerceManagerRole,
} from "./page-types";

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

const emptyEmbeddingSummary: KnowledgeEmbeddingSummary = {
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

type KnowledgeArticleRow = {
  id: string;
  slug: string;
  title: string;
  content: string;
  status: ArticleStatus;
  version: number;
  created_by_id: string | null;
  updated_by_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_by_id: string | null;
};

type KnowledgeArticleHistoryRow = {
  id: string;
  article_id: string;
  title: string;
  content: string;
  version: number;
  change_type: KnowledgeArticleHistory["changeType"];
  changed_by_id: string | null;
  changed_at: string;
};

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

export async function getKnowledgeBaseData(
  selectedId?: string | null,
  searchQuery?: string | null,
  requestedView: KnowledgeBaseView = "active",
): Promise<KnowledgeBasePageData> {
  let articles: KnowledgeArticle[] = [];
  let selectedArticle: KnowledgeArticle | null = null;
  let history: KnowledgeArticleHistory[] = [];
  let currentManager: Manager | null = null;
  let allManagers: Manager[] = [];
  let view: KnowledgeBaseView = "active";
  let totalCount = 0;
  let publishedCount = 0;
  let embeddingSummary: KnowledgeEmbeddingSummary = emptyEmbeddingSummary;
  let embeddingRefreshBatch: KnowledgeEmbeddingRefreshBatch | null = null;
  let errorMessage: string | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    
    // 1. Текущий менеджер
    currentManager = await getCurrentManager().catch(() => null);
    const canManageArchive = currentManager?.role === "admin" || currentManager?.role === "supervisor";
    view = requestedView === "archive" && canManageArchive ? "archive" : "active";

    const { data: managersData, error: managersError } = await supabase
      .from("managers")
      .select("id, email, display_name, last_name, role")
      .order("display_name");

    if (managersError) {
      console.error("Fetch managers error:", managersError);
    } else {
      allManagers = (managersData ?? []).map((manager) => ({
        id: manager.id,
        email: manager.email,
        displayName: manager.display_name,
        lastName: manager.last_name,
        role: coerceManagerRole(manager.role),
      }));
    }

    const { data: summaryData, error: summaryError } = await supabase
      .rpc("get_kb_embeddings_summary_v1");

    if (summaryError) {
      console.error("Fetch KB embeddings summary error:", formatSupabaseError(summaryError));
    } else {
      embeddingSummary = mapEmbeddingSummary(summaryData);
    }

    const { data: batchData, error: batchError } = await supabase
      .rpc("get_kb_embedding_refresh_batch_state_v1");

    if (batchError) {
      console.error("Fetch KB embedding refresh batch error:", formatSupabaseError(batchError));
    } else {
      embeddingRefreshBatch = mapEmbeddingRefreshBatch(batchData);
    }

    // 2. Статьи с учетом поиска
    let query = supabase.from("knowledge_base_articles").select("*");

    if (view === "archive") {
      query = query.eq("status", "archived");
    } else {
      query = query.neq("status", "archived");
    }
    
    if (searchQuery) {
      query = query.textSearch("search_vector", searchQuery, {
        config: "russian",
        type: "websearch"
      });
    }

    const { data: articlesData, error: articlesError } = await query
      .order("updated_at", { ascending: false });

    if (articlesError) {
      console.error("Fetch articles error:", articlesError);
      errorMessage = "Не удалось загрузить статьи.";
    } else {
      articles = (articlesData || []).map(mapArticle);
    }

    // 3. Выбранная статья и её история
    if (selectedId && !errorMessage) {
      selectedArticle = articles.find(a => a.id === selectedId) || null;
      
      if (selectedArticle) {
        const { data: embeddingState, error: embeddingStateError } = await supabase
          .rpc("get_kb_article_embedding_state_v1", {
            p_article_id: selectedId,
          });

        if (embeddingStateError) {
          console.error("Fetch article embedding state error:", embeddingStateError);
        } else {
          selectedArticle = {
            ...selectedArticle,
            ...mapEmbeddingState(embeddingState),
          };
        }

        const { data: historyData, error: historyError } = await supabase
          .from("knowledge_base_history")
          .select("*")
          .eq("article_id", selectedId)
          .order("changed_at", { ascending: false });

        if (!historyError && historyData) {
          history = historyData.map(mapHistory);
        } else if (historyError) {
          console.error("Fetch article history error:", historyError);
        }
      }
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
    publishedCount: articles.filter(a => a.status === "published").length,
    embeddingSummary,
    embeddingRefreshBatch,
    errorMessage,
  };
}

function mapArticle(row: KnowledgeArticleRow): KnowledgeArticle {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    content: row.content,
    status: row.status,
    version: row.version,
    createdById: row.created_by_id,
    updatedById: row.updated_by_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    archivedById: row.archived_by_id,
    embeddingStatus: "unavailable",
    embeddingChunkSetId: null,
    embeddingErrorMessage: null,
  };
}

export function mapEmbeddingState(value: unknown): Pick<KnowledgeArticle, "embeddingStatus" | "embeddingChunkSetId" | "embeddingErrorMessage"> {
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

export function mapEmbeddingSummary(value: unknown): KnowledgeEmbeddingSummary {
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

export function mapEmbeddingRefreshBatch(value: unknown): KnowledgeEmbeddingRefreshBatch | null {
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

function formatSupabaseError(error: unknown) {
  const record = isRecord(error) ? error : null;

  return {
    code: record?.code,
    message: record?.message,
    details: record?.details,
    hint: record?.hint,
  };
}

function mapHistory(row: KnowledgeArticleHistoryRow): KnowledgeArticleHistory {
  return {
    id: row.id,
    articleId: row.article_id,
    title: row.title,
    content: row.content,
    version: row.version,
    changeType: row.change_type,
    changedById: row.changed_by_id,
    changedAt: row.changed_at,
  };
}
