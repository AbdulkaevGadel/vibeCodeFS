import {createSupabaseServerClient} from "@/lib/supabase-server";
import {getCurrentManager} from "./manager-utils";
import {
  ArticleEmbeddingStatus,
  KnowledgeArticle,
  KnowledgeArticleHistory,
  KnowledgeBaseView,
  KnowledgeEmbeddingRefreshBatch,
  KnowledgeEmbeddingSummary,
  Manager,
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
        role: manager.role,
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
  } catch (err: any) {
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

function mapArticle(row: any): KnowledgeArticle {
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

function mapEmbeddingState(value: any): Pick<KnowledgeArticle, "embeddingStatus" | "embeddingChunkSetId" | "embeddingErrorMessage"> {
  const allowedStatuses = new Set<ArticleEmbeddingStatus>([
    "actual",
    "outdated",
    "updating",
    "failed",
    "unavailable",
  ]);
  const rawStatus = value?.embedding_status;
  const embeddingStatus = allowedStatuses.has(rawStatus) ? rawStatus : "unavailable";

  return {
    embeddingStatus,
    embeddingChunkSetId: typeof value?.chunk_set_id === "string" ? value.chunk_set_id : null,
    embeddingErrorMessage: typeof value?.error_message === "string" && value.error_message.trim()
      ? value.error_message
      : null,
  };
}

export function mapEmbeddingSummary(value: any): KnowledgeEmbeddingSummary {
  return {
    totalCount: readNumber(value?.total_count),
    publishedCount: readNumber(value?.published_count),
    actualCount: readNumber(value?.actual_count),
    outdatedCount: readNumber(value?.outdated_count),
    updatingCount: readNumber(value?.updating_count),
    failedCount: readNumber(value?.failed_count),
    unavailableCount: readNumber(value?.unavailable_count),
    refreshableCount: readNumber(value?.refreshable_count),
  };
}

export function mapEmbeddingRefreshBatch(value: any): KnowledgeEmbeddingRefreshBatch | null {
  const batch = value?.batch;

  if (!batch || typeof batch !== "object") {
    return null;
  }

  const items = Array.isArray(value?.items) ? value.items : [];

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
    items: items.map((item: any) => ({
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

function formatSupabaseError(error: any) {
  return {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
  };
}

function mapHistory(row: any): KnowledgeArticleHistory {
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
