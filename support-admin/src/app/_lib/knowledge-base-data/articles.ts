import {
  mapKnowledgeArticle,
  mapKnowledgeArticleHistory,
  type KnowledgeArticle,
  type KnowledgeArticleHistory,
  type KnowledgeBaseView,
} from "@/entities/knowledge-article";
import { loadKnowledgeArticleEmbeddingState } from "./embeddings";
import type { SupabaseServerClient } from "./types";

export async function loadKnowledgeArticles(
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

export async function loadSelectedKnowledgeArticleDetails(
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
