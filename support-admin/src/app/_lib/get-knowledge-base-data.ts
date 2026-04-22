import {createSupabaseServerClient} from "@/lib/supabase-server";
import {getCurrentManager} from "./manager-utils";
import {KnowledgeArticle, KnowledgeArticleHistory, KnowledgeBaseView, Manager} from "./page-types";

export type KnowledgeBasePageData = {
  articles: KnowledgeArticle[];
  selectedArticle: KnowledgeArticle | null;
  history: KnowledgeArticleHistory[];
  currentManager: Manager | null;
  view: KnowledgeBaseView;
  totalCount: number;
  publishedCount: number;
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
  let totalCount = 0;
  let publishedCount = 0;
  let errorMessage: string | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    
    // 1. Текущий менеджер
    currentManager = await getCurrentManager().catch(() => null);
    const canManageArchive = currentManager?.role === "admin" || currentManager?.role === "supervisor";
    view = requestedView === "archive" && canManageArchive ? "archive" : "active";

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
    view,
    totalCount: articles.length,
    publishedCount: articles.filter(a => a.status === "published").length,
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
