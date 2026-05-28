"use server";

import { revalidatePath } from "next/cache";
import { isPrivilegedManager } from "@/entities/manager";
import { getCurrentManager } from "@/entities/manager/api/current-manager";
import { createSupabaseServerClient } from "@/shared/api/supabase/server-client";
import {
  getArticleEmbeddingActionErrorMessage,
  invokeKbIngestion,
} from "./article-embedding-api";

export async function refreshArticleEmbeddingsAction(id: string, expectedVersion: number) {
  const supabase = await createSupabaseServerClient();

  try {
    const currentManager = await getCurrentManager().catch(() => null);

    if (!currentManager) {
      return { error: "Обновлять знания ИИ могут только пользователи с ролью менеджера." };
    }

    if (!isPrivilegedManager(currentManager)) {
      return { error: "Обновлять знания ИИ могут только supervisor или admin." };
    }

    const { data, error } = await supabase.rpc("request_kb_article_embedding_refresh_v1", {
      p_article_id: id,
      p_expected_version: expectedVersion,
    });

    if (error) {
      throw error;
    }

    const result = data as {
      type?: string;
      chunk_set_id?: string | null;
      embedding_status?: string;
    } | null;

    if (!result?.type) {
      throw new Error("EMPTY_EMBEDDING_REFRESH_RESULT");
    }

    switch (result.type) {
      case "version_conflict":
        revalidatePath("/knowledge-base");
        return { error: "Статья была изменена. Обновите страницу и повторите действие." };
      case "forbidden":
        return { error: "Обновлять знания ИИ могут только supervisor или admin." };
      case "not_found":
        revalidatePath("/knowledge-base");
        return { error: "Статья не найдена." };
      case "unavailable":
        revalidatePath("/knowledge-base");
        return { error: "Embeddings недоступны для этой статьи." };
      case "already_actual":
        revalidatePath("/knowledge-base");
        return { data: result, message: "Embeddings уже актуальны" };
      case "already_updating":
        revalidatePath("/knowledge-base");
        return { data: result, message: "Обновление embeddings уже запущено" };
      case "queued":
      case "retry_queued":
        break;
      default:
        revalidatePath("/knowledge-base");
        return { error: "Не удалось запустить обновление знаний ИИ." };
    }

    if (!result.chunk_set_id) {
      throw new Error("EMBEDDING_REFRESH_CHUNK_SET_ID_MISSING");
    }

    await invokeKbIngestion(result.chunk_set_id);

    revalidatePath("/knowledge-base");
    return { data: result, message: "Обновление знаний ИИ запущено" };
  } catch (err: unknown) {
    console.error("Knowledge Base Embedding Refresh Error:", err);
    return { error: getArticleEmbeddingActionErrorMessage(err, "Ошибка при обновлении знаний ИИ") };
  }
}
