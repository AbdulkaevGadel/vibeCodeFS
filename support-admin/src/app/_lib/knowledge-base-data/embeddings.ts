import {
  emptyKnowledgeEmbeddingSummary,
  mapKnowledgeArticleEmbeddingState,
  mapKnowledgeEmbeddingRefreshBatch,
  mapKnowledgeEmbeddingSummary,
  type KnowledgeArticle,
  type KnowledgeEmbeddingRefreshBatch,
  type KnowledgeEmbeddingSummary,
} from "@/entities/knowledge-article";
import type { SupabaseServerClient } from "./types";

export async function loadKnowledgeEmbeddingSummary(
  supabase: SupabaseServerClient,
): Promise<KnowledgeEmbeddingSummary> {
  const { data, error } = await supabase.rpc("get_kb_embeddings_summary_v1");

  if (error) {
    console.error("Fetch KB embeddings summary error:", formatSupabaseError(error));
    return emptyKnowledgeEmbeddingSummary;
  }

  return mapKnowledgeEmbeddingSummary(data);
}

export async function loadKnowledgeEmbeddingRefreshBatch(
  supabase: SupabaseServerClient,
): Promise<KnowledgeEmbeddingRefreshBatch | null> {
  const { data, error } = await supabase.rpc("get_kb_embedding_refresh_batch_state_v1");

  if (error) {
    console.error("Fetch KB embedding refresh batch error:", formatSupabaseError(error));
    return null;
  }

  return mapKnowledgeEmbeddingRefreshBatch(data);
}

export async function loadKnowledgeArticleEmbeddingState(
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
