import "server-only";

import { mapKnowledgeEmbeddingRefreshBatch } from "@/entities/knowledge-article";
import { createSupabaseServerClient } from "@/shared/api/supabase/server-client";

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

export function getBatchActionErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function getBatchErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function readEmbeddingRefreshBatchState() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_kb_embedding_refresh_batch_state_v1");

  if (error) {
    throw error;
  }

  return mapKnowledgeEmbeddingRefreshBatch(data);
}

export async function failEmbeddingRefreshBatchStart(batchId: string | null, errorMessage: string) {
  if (!batchId) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("fail_kb_embedding_refresh_batch_start_v1", {
    p_batch_id: batchId,
    p_error_message: errorMessage,
  });

  if (error) {
    console.error("Knowledge Base Embedding Refresh Batch Fail Start Error:", error);
  }
}

export async function invokeKbEmbeddingRefreshBatch(batchId: string | null) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const internalSecret = process.env.INTERNAL_SECRET?.trim();

  if (!supabaseUrl || !internalSecret) {
    throw new Error("INTERNAL_SECRET_OR_SUPABASE_URL_NOT_CONFIGURED");
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/kb-embedding-refresh-batch`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": internalSecret,
    },
    body: JSON.stringify({
      batch_id: batchId,
    }),
  });

  const responseText = await response.text();
  const body = parseJsonObject(responseText);

  if (!response.ok || body?.ok === false) {
    console.error("KB embedding refresh batch invocation failed:", {
      status: response.status,
      body,
    });
    throw new Error("Не удалось запустить batch worker.");
  }
}
