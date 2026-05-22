"use server";

import { revalidatePath } from "next/cache";
import type { ArticleStatus } from "@/entities/knowledge-article";
import { getCurrentManager } from "@/entities/manager/api/current-manager";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  getKnowledgeArticleActionErrorMessage,
  invokePendingArticleIngestionIfNeeded,
} from "./article-ingestion-api";
import {
  getCreateArticleRpcErrorMessage,
  getUpdateArticleRpcErrorMessage,
} from "./article-rpc-error-messages";

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
      const { data, error } = await supabase.rpc("create_kb_article_v1", {
        p_title: title,
        p_content: content,
        p_slug: slug,
        p_status: status,
      });

      if (error) {
        const errorMessage = getCreateArticleRpcErrorMessage(error);

        if (errorMessage) {
          return { error: errorMessage };
        }

        throw error;
      }

      await invokePendingArticleIngestionIfNeeded(data?.id ?? null);
      revalidatePath("/knowledge-base");
      return { data };
    }

    if (expectedVersion === undefined) {
      throw new Error("expectedVersion is required for updates");
    }

    const { data, error } = await supabase.rpc("update_kb_article_v1", {
      p_id: id,
      p_title: title,
      p_content: content,
      p_slug: slug,
      p_status: status,
      p_version: expectedVersion,
    });

    if (error) {
      const errorMessage = getUpdateArticleRpcErrorMessage(error);

      if (errorMessage) {
        return { error: errorMessage };
      }

      throw error;
    }

    await invokePendingArticleIngestionIfNeeded(data?.id ?? null);
    revalidatePath("/knowledge-base");
    return { data };
  } catch (err: unknown) {
    console.error("Knowledge Base Upsert Error:", err);
    return { error: getKnowledgeArticleActionErrorMessage(err, "Произошла внутренняя ошибка") };
  }
}
