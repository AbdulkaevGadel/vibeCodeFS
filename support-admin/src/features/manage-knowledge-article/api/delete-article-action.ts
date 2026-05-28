"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/shared/api/supabase/server-client";
import { getKnowledgeArticleActionErrorMessage } from "./article-ingestion-api";
import { getDeleteArticleRpcErrorMessage } from "./article-rpc-error-messages";

export async function deleteArticleAction(id: string, expectedVersion: number) {
  const supabase = await createSupabaseServerClient();

  try {
    const { data, error } = await supabase.rpc("delete_kb_article_v1", {
      p_id: id,
      p_version: expectedVersion,
    });

    if (error) {
      const errorMessage = getDeleteArticleRpcErrorMessage(error);

      if (errorMessage) {
        return { error: errorMessage };
      }

      throw error;
    }

    revalidatePath("/knowledge-base");
    return { data };
  } catch (err: unknown) {
    console.error("Knowledge Base Delete Error:", err);
    return { error: getKnowledgeArticleActionErrorMessage(err, "Ошибка при удалении статьи") };
  }
}
