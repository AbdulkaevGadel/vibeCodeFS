"use server";

import {
  getBatchActionErrorMessage,
  readEmbeddingRefreshBatchState,
} from "./embedding-batch-api";

export async function getKnowledgeEmbeddingRefreshBatchStateAction() {
  try {
    return {
      data: await readEmbeddingRefreshBatchState(),
    };
  } catch (err: unknown) {
    console.error("Knowledge Base Embedding Refresh Batch State Error:", err);
    return { error: getBatchActionErrorMessage(err, "Ошибка при загрузке прогресса обновления знаний ИИ") };
  }
}
