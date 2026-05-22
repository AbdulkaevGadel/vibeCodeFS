import "server-only";

import { mapKnowledgeArticleEmbeddingState } from "@/entities/knowledge-article";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

function parseJsonObject(text: string): JsonObject | null {
  try {
    const parsed: unknown = text ? JSON.parse(text) : null;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getArticleEmbeddingActionErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function readArticleEmbeddingState(articleId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_kb_article_embedding_state_v1", {
    p_article_id: articleId,
  });

  if (error) {
    throw error;
  }

  return mapKnowledgeArticleEmbeddingState(data);
}

export async function invokeKbIngestion(chunkSetId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const internalSecret = process.env.INTERNAL_SECRET?.trim();

  if (!supabaseUrl || !internalSecret) {
    throw new Error("INTERNAL_SECRET_OR_SUPABASE_URL_NOT_CONFIGURED");
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/kb-ingestion`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": internalSecret,
    },
    body: JSON.stringify({
      mode: "webhook",
      chunk_set_id: chunkSetId,
    }),
  });

  const responseText = await response.text();
  const body = parseJsonObject(responseText);

  if (!response.ok || body?.ok === false) {
    console.error("KB ingestion invocation failed:", {
      status: response.status,
      body,
    });
    throw new Error("Не удалось запустить ingestion pipeline.");
  }
}
