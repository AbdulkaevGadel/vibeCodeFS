"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";
import { ArticleStatus } from "../../_lib/page-types";
import { getCurrentManager } from "../../_lib/manager-utils";

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

      revalidatePath("/knowledge-base");
      return { data };
    }
  } catch (err: any) {
    console.error("Knowledge Base Upsert Error:", err);
    return { error: err.message || "Произошла внутренняя ошибка" };
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
  } catch (err: any) {
    console.error("Knowledge Base Status Error:", err);
    return { error: err.message || "Ошибка при изменении статуса" };
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
  } catch (err: any) {
    console.error("Knowledge Base Delete Error:", err);
    return { error: err.message || "Ошибка при удалении статьи" };
  }
}
