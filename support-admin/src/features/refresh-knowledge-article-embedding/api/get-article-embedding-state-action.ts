"use server";

import {
  getArticleEmbeddingActionErrorMessage,
  readArticleEmbeddingState,
} from "./article-embedding-api";

export async function getArticleEmbeddingStateAction(id: string) {
  try {
    if (!id) {
      return { error: "ARTICLE_ID_REQUIRED" };
    }

    return {
      data: await readArticleEmbeddingState(id),
    };
  } catch (err: unknown) {
    console.error("Knowledge Base Embedding State Error:", err);
    return { error: getArticleEmbeddingActionErrorMessage(err, "Ошибка при загрузке статуса знаний ИИ") };
  }
}
