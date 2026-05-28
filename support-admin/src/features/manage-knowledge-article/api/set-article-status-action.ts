"use server";

import { revalidatePath } from "next/cache";
import type { ArticleStatus } from "@/entities/knowledge-article";
import { createSupabaseServerClient } from "@/shared/api/supabase/server-client";
import { getKnowledgeArticleActionErrorMessage } from "./article-ingestion-api";
import { getSetArticleStatusRpcErrorMessage } from "./article-rpc-error-messages";

export async function setArticleStatusAction(id: string, status: ArticleStatus, expectedVersion: number) {
  const supabase = await createSupabaseServerClient();

  try {
    const rpcName = status === "archived" ? "archive_kb_article_v1" : "restore_kb_article_v1";

    const { data, error } = await supabase.rpc(rpcName, {
      p_id: id,
      p_version: expectedVersion,
    });

    if (error) {
      const errorMessage = getSetArticleStatusRpcErrorMessage(error);

      if (errorMessage) {
        return { error: errorMessage };
      }

      throw error;
    }

    revalidatePath("/knowledge-base");
    return { data };
  } catch (err: unknown) {
    console.error("Knowledge Base Status Error:", err);
    return { error: getKnowledgeArticleActionErrorMessage(err, "Ошибка при изменении статуса") };
  }
}
