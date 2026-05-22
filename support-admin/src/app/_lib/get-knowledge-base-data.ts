import {createSupabaseServerClient} from "@/lib/supabase-server";
import {
  isPrivilegedManager,
  mapManagerRow,
  type Manager,
} from "@/entities/manager";
import {
  emptyKnowledgeEmbeddingSummary,
  mapKnowledgeArticle,
  mapKnowledgeArticleEmbeddingState,
  mapKnowledgeArticleHistory,
  mapKnowledgeEmbeddingRefreshBatch,
  mapKnowledgeEmbeddingSummary,
  type KnowledgeArticle,
  type KnowledgeArticleHistory,
  type KnowledgeBaseView,
  type KnowledgeEmbeddingRefreshBatch,
  type KnowledgeEmbeddingSummary,
} from "@/entities/knowledge-article";
import {getCurrentManager} from "./manager-utils";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

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

    currentManager = await getCurrentManager().catch(() => null);
    view = resolveKnowledgeBaseView(requestedView, currentManager);
    allManagers = await loadKnowledgeManagers(supabase);
    embeddingSummary = await loadKnowledgeEmbeddingSummary(supabase);
    embeddingRefreshBatch = await loadKnowledgeEmbeddingRefreshBatch(supabase);

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

async function loadKnowledgeManagers(supabase: SupabaseServerClient): Promise<Manager[]> {
  const { data, error } = await supabase
    .from("managers")
    .select("id, email, display_name, last_name, role")
    .order("display_name");

  if (error) {
    console.error("Fetch managers error:", error);
    return [];
  }

  return (data ?? []).map(mapManagerRow);
}

async function loadKnowledgeEmbeddingSummary(
  supabase: SupabaseServerClient,
): Promise<KnowledgeEmbeddingSummary> {
  const { data, error } = await supabase.rpc("get_kb_embeddings_summary_v1");

  if (error) {
    console.error("Fetch KB embeddings summary error:", formatSupabaseError(error));
    return emptyKnowledgeEmbeddingSummary;
  }

  return mapKnowledgeEmbeddingSummary(data);
}

async function loadKnowledgeEmbeddingRefreshBatch(
  supabase: SupabaseServerClient,
): Promise<KnowledgeEmbeddingRefreshBatch | null> {
  const { data, error } = await supabase.rpc("get_kb_embedding_refresh_batch_state_v1");

  if (error) {
    console.error("Fetch KB embedding refresh batch error:", formatSupabaseError(error));
    return null;
  }

  return mapKnowledgeEmbeddingRefreshBatch(data);
}

async function loadKnowledgeArticles(
  supabase: SupabaseServerClient,
  view: KnowledgeBaseView,
  searchQuery?: string | null,
): Promise<{
  articles: KnowledgeArticle[];
  errorMessage: string | null;
}> {
  let query = supabase.from("knowledge_base_articles").select("*");

  if (view === "archive") {
    query = query.eq("status", "archived");
  } else {
    query = query.neq("status", "archived");
  }

  if (searchQuery) {
    query = query.textSearch("search_vector", searchQuery, {
      config: "russian",
      type: "websearch",
    });
  }

  const { data, error } = await query.order("updated_at", { ascending: false });

  if (error) {
    console.error("Fetch articles error:", error);
    return {
      articles: [],
      errorMessage: "Не удалось загрузить статьи.",
    };
  }

  return {
    articles: (data ?? []).map(mapKnowledgeArticle),
    errorMessage: null,
  };
}

async function loadSelectedKnowledgeArticleDetails(
  supabase: SupabaseServerClient,
  articles: KnowledgeArticle[],
  selectedId: string,
): Promise<{
  selectedArticle: KnowledgeArticle | null;
  history: KnowledgeArticleHistory[];
}> {
  const article = articles.find((item) => item.id === selectedId) ?? null;

  if (!article) {
    return {
      selectedArticle: null,
      history: [],
    };
  }

  const [embeddingState, history] = await Promise.all([
    loadKnowledgeArticleEmbeddingState(supabase, selectedId),
    loadKnowledgeArticleHistory(supabase, selectedId),
  ]);

  return {
    selectedArticle: {
      ...article,
      ...embeddingState,
    },
    history,
  };
}

async function loadKnowledgeArticleEmbeddingState(
  supabase: SupabaseServerClient,
  articleId: string,
): Promise<Pick<KnowledgeArticle, "embeddingStatus" | "embeddingChunkSetId" | "embeddingErrorMessage">> {
  const { data, error } = await supabase.rpc("get_kb_article_embedding_state_v1", {
    p_article_id: articleId,
  });

  if (error) {
    console.error("Fetch article embedding state error:", error);
    return mapKnowledgeArticleEmbeddingState(null);
  }

  return mapKnowledgeArticleEmbeddingState(data);
}

async function loadKnowledgeArticleHistory(
  supabase: SupabaseServerClient,
  articleId: string,
): Promise<KnowledgeArticleHistory[]> {
  const { data, error } = await supabase
    .from("knowledge_base_history")
    .select("*")
    .eq("article_id", articleId)
    .order("changed_at", { ascending: false });

  if (error) {
    console.error("Fetch article history error:", error);
    return [];
  }

  return (data ?? []).map(mapKnowledgeArticleHistory);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
