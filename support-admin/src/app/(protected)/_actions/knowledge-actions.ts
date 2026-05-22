"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isPrivilegedManager } from "@/entities/manager";
import {
  mapKnowledgeArticleEmbeddingState,
  mapKnowledgeEmbeddingRefreshBatch,
  type ArticleStatus,
} from "@/entities/knowledge-article";
import { revalidatePath } from "next/cache";
import { getCurrentManager } from "../../_lib/manager-utils";

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

function getActionErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Создает или обновляет статью Базы Знаний.
 * Реализует Optimistic Locking через проверку версии.
 */
export async function upsertArticleAction(
  id: string | null,
  title: string,
  content: string,
  slug: string,
  status: ArticleStatus,
  expectedVersion?: number,
) {
  const supabase = await createSupabaseServerClient();

  try {
    const currentManager = await getCurrentManager().catch(() => null);

    if (!currentManager) {
      return { error: "Создавать и редактировать статьи могут только пользователи с ролью менеджера." };
    }

    if (!id) {
      // RPC: Создание новой статьи (с генератором слагов)
      const { data, error } = await supabase.rpc("create_kb_article_v1", {
        p_title: title,
        p_content: content,
        p_slug: slug,
        p_status: status,
      });

      if (error) {
        if (error.message.includes("SLUG_GENERATION_FAILED")) {
          return { error: "Не удалось создать уникальный адрес статьи. Попробуйте другой заголовок." };
        }
        throw error;
      }
      
      await invokePendingArticleIngestionIfNeeded(data?.id ?? null);
      revalidatePath("/knowledge-base");
      return { data };
    } else {
      // RPC: Обновление с проверкой версии и авторства
      if (expectedVersion === undefined) throw new Error("expectedVersion is required for updates");

      const { data, error } = await supabase.rpc("update_kb_article_v1", {
        p_id: id,
        p_title: title,
        p_content: content,
        p_slug: slug,
        p_status: status,
        p_version: expectedVersion
      });

      if (error) {
        if (error.message.includes("VERSION_CONFLICT_OR_FORBIDDEN")) {
          return { error: "Ошибка доступа или конфликт версий: статья была изменена другим менеджером." };
        }
        if (error.code === "23505") return { error: "Статья с таким адресом (slug) уже существует." };
        throw error;
      }

      await invokePendingArticleIngestionIfNeeded(data?.id ?? null);
      revalidatePath("/knowledge-base");
      return { data };
    }
  } catch (err: unknown) {
    console.error("Knowledge Base Upsert Error:", err);
    return { error: getActionErrorMessage(err, "Произошла внутренняя ошибка") };
  }
}

/**
 * Переводит статью в архив или обратно через специализированные RPC.
 */
export async function setArticleStatusAction(id: string, status: ArticleStatus, expectedVersion: number) {
  const supabase = await createSupabaseServerClient();

  try {
    const rpcName = status === 'archived' ? 'archive_kb_article_v1' : 'restore_kb_article_v1';
    
    const { data, error } = await supabase.rpc(rpcName, {
      p_id: id,
      p_version: expectedVersion
    });

    if (error) {
      if (error.message.includes("VERSION_CONFLICT_OR_FORBIDDEN")) {
        return { error: "Не удалось изменить статус: конфликт версий." };
      }
      if (error.message.includes("KB_LIFECYCLE_FORBIDDEN")) {
        return { error: "Только supervisor или admin может архивировать и восстанавливать статьи." };
      }
      throw error;
    }

    revalidatePath("/knowledge-base");
    return { data };
  } catch (err: unknown) {
    console.error("Knowledge Base Status Error:", err);
    return { error: getActionErrorMessage(err, "Ошибка при изменении статуса") };
  }
}

/**
 * Физически удаляет архивную статью. Разрешено только supervisor/admin на уровне RPC.
 */
export async function deleteArticleAction(id: string, expectedVersion: number) {
  const supabase = await createSupabaseServerClient();

  try {
    const { data, error } = await supabase.rpc("delete_kb_article_v1", {
      p_id: id,
      p_version: expectedVersion,
    });

    if (error) {
      if (error.message.includes("KB_DELETE_FORBIDDEN")) {
        return { error: "Только supervisor или admin может удалить статью навсегда." };
      }
      if (error.message.includes("KB_DELETE_REQUIRES_ARCHIVED")) {
        return { error: "Навсегда можно удалить только архивную статью." };
      }
      if (error.message.includes("VERSION_CONFLICT_OR_FORBIDDEN")) {
        return { error: "Не удалось удалить статью: конфликт версий." };
      }
      throw error;
    }

    revalidatePath("/knowledge-base");
    return { data };
  } catch (err: unknown) {
    console.error("Knowledge Base Delete Error:", err);
    return { error: getActionErrorMessage(err, "Ошибка при удалении статьи") };
  }
}

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

    if (result.type === "version_conflict") {
      revalidatePath("/knowledge-base");
      return { error: "Статья была изменена. Обновите страницу и повторите действие." };
    }

    if (result.type === "forbidden") {
      return { error: "Обновлять знания ИИ могут только supervisor или admin." };
    }

    if (result.type === "not_found") {
      revalidatePath("/knowledge-base");
      return { error: "Статья не найдена." };
    }

    if (result.type === "unavailable") {
      revalidatePath("/knowledge-base");
      return { error: "Embeddings недоступны для этой статьи." };
    }

    if (result.type === "already_actual") {
      revalidatePath("/knowledge-base");
      return { data: result, message: "Embeddings уже актуальны" };
    }

    if (result.type === "already_updating") {
      revalidatePath("/knowledge-base");
      return { data: result, message: "Обновление embeddings уже запущено" };
    }

    if (result.type !== "queued" && result.type !== "retry_queued") {
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
    return { error: getActionErrorMessage(err, "Ошибка при обновлении знаний ИИ") };
  }
}

export async function getArticleEmbeddingStateAction(id: string) {
  const supabase = await createSupabaseServerClient();

  try {
    if (!id) {
      return { error: "ARTICLE_ID_REQUIRED" };
    }

    const { data, error } = await supabase.rpc("get_kb_article_embedding_state_v1", {
      p_article_id: id,
    });

    if (error) {
      throw error;
    }

    return {
      data: mapKnowledgeArticleEmbeddingState(data),
    };
  } catch (err: unknown) {
    console.error("Knowledge Base Embedding State Error:", err);
    return { error: getActionErrorMessage(err, "Ошибка при загрузке статуса знаний ИИ") };
  }
}

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

    if (result.type === "forbidden") {
      return { error: "Обновлять все знания ИИ могут только supervisor или admin." };
    }

    if (result.type === "empty") {
      revalidatePath("/knowledge-base");
      return {
        data: await readEmbeddingRefreshBatchState(),
        message: "Нет статей, которым требуется обновление.",
      };
    }

    if (result.type !== "created" && result.type !== "already_running") {
      return { error: "Не удалось создать batch-задачу обновления знаний ИИ." };
    }

    const batchId = result.batch_id ?? null;

    try {
      await invokeKbEmbeddingRefreshBatch(batchId);
    } catch (invokeError) {
      console.error("Knowledge Base Embedding Refresh Batch Worker Invoke Error:", invokeError);
      await failEmbeddingRefreshBatchStart(batchId, getErrorMessage(invokeError));
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
    return { error: getActionErrorMessage(err, "Ошибка при массовом обновлении знаний ИИ") };
  }
}

async function failEmbeddingRefreshBatchStart(batchId: string | null, errorMessage: string) {
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

export async function getKnowledgeEmbeddingRefreshBatchStateAction() {
  try {
    return {
      data: await readEmbeddingRefreshBatchState(),
    };
  } catch (err: unknown) {
    console.error("Knowledge Base Embedding Refresh Batch State Error:", err);
    return { error: getActionErrorMessage(err, "Ошибка при загрузке прогресса обновления знаний ИИ") };
  }
}

async function readEmbeddingRefreshBatchState() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_kb_embedding_refresh_batch_state_v1");

  if (error) {
    throw error;
  }

  return mapKnowledgeEmbeddingRefreshBatch(data);
}

async function invokePendingArticleIngestionIfNeeded(articleId: string | null) {
  if (!articleId) {
    return;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_kb_article_embedding_state_v1", {
      p_article_id: articleId,
    });

    if (error) {
      console.error("Knowledge Base Post-Save Embedding State Error:", error);
      return;
    }

    const state = mapKnowledgeArticleEmbeddingState(data);
    const chunkSetId = typeof data?.chunk_set_id === "string" ? data.chunk_set_id : null;

    if (state.embeddingStatus !== "updating" || !chunkSetId) {
      return;
    }

    await invokeKbIngestion(chunkSetId);
  } catch (error) {
    console.error("Knowledge Base Post-Save Ingestion Bootstrap Error:", error);
  }
}

async function invokeKbEmbeddingRefreshBatch(batchId: string | null) {
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

async function invokeKbIngestion(chunkSetId: string) {
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
