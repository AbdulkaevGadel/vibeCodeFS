"use server";

import { revalidatePath } from "next/cache";
import { isPrivilegedManager } from "@/entities/manager";
import { getCurrentManager } from "@/entities/manager/api/current-manager";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  failEmbeddingRefreshBatchStart,
  getBatchActionErrorMessage,
  getBatchErrorMessage,
  invokeKbEmbeddingRefreshBatch,
  readEmbeddingRefreshBatchState,
} from "./embedding-batch-api";

export async function startKnowledgeEmbeddingRefreshBatchAction() {
  const supabase = await createSupabaseServerClient();

  try {
    const currentManager = await getCurrentManager().catch(() => null);

    if (!currentManager) {
      return { error: "Обновлять знания ИИ могут только пользователи с ролью менеджера." };
    }

    if (!isPrivilegedManager(currentManager)) {
      return { error: "Обновлять все знания ИИ могут только supervisor или admin." };
    }

    const { data, error } = await supabase.rpc("create_kb_embedding_refresh_batch_v1");

    if (error) {
      throw error;
    }

    const result = data as {
      type?: string;
      batch_id?: string | null;
      total_count?: number;
    } | null;

    if (!result?.type) {
      throw new Error("EMPTY_KB_EMBEDDING_REFRESH_BATCH_RESULT");
    }

    switch (result.type) {
      case "forbidden":
        return { error: "Обновлять все знания ИИ могут только supervisor или admin." };
      case "empty":
        revalidatePath("/knowledge-base");
        return {
          data: await readEmbeddingRefreshBatchState(),
          message: "Нет статей, которым требуется обновление.",
        };
      case "created":
      case "already_running":
        break;
      default:
        return { error: "Не удалось создать batch-задачу обновления знаний ИИ." };
    }

    const batchId = result.batch_id ?? null;

    try {
      await invokeKbEmbeddingRefreshBatch(batchId);
    } catch (invokeError) {
      console.error("Knowledge Base Embedding Refresh Batch Worker Invoke Error:", invokeError);
      await failEmbeddingRefreshBatchStart(batchId, getBatchErrorMessage(invokeError));
      revalidatePath("/knowledge-base");
      return {
        data: await readEmbeddingRefreshBatchState(),
        error: "Batch-задача создана, но worker не запустился. Проверьте deploy Edge Function kb-embedding-refresh-batch и INTERNAL_SECRET.",
      };
    }

    revalidatePath("/knowledge-base");
    return {
      data: await readEmbeddingRefreshBatchState(),
      message: result.type === "already_running"
        ? "Массовое обновление уже выполняется."
        : "Массовое обновление знаний ИИ запущено.",
    };
  } catch (err: unknown) {
    console.error("Knowledge Base Embedding Refresh Batch Error:", err);
    return { error: getBatchActionErrorMessage(err, "Ошибка при массовом обновлении знаний ИИ") };
  }
}
