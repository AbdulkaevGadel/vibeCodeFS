"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";
import { ArticleStatus } from "../../_lib/page-types";

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
  const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

  try {
    if (!id) {
      // INSERT: Создание новой статьи
      const { data, error } = await supabase
        .from("knowledge_base_articles")
        .insert({
          title,
          content,
          slug: cleanSlug,
          status,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") return { error: "Статья с таким адресом (slug) уже существует." };
        throw error;
      }
      
      revalidatePath("/knowledge-base");
      return { data };
    } else {
      // UPDATE: Обновление с проверкой версии
      if (expectedVersion === undefined) throw new Error("expectedVersion is required for updates");

      const { data, error, count } = await supabase
        .from("knowledge_base_articles")
        .update({
          title,
          content,
          slug: cleanSlug,
          status,
          version: expectedVersion + 1, // Инкремент версии в SQL
        })
        .eq("id", id)
        .eq("version", expectedVersion) // Optimistic Lock Check
        .select()
        .single();

      if (error) {
        if (error.code === "PGRST116") return { error: "Конфликт версий: статья была изменена другим пользователем. Обновите страницу." };
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
 * Переводит статью в архив или обратно.
 */
export async function setArticleStatusAction(id: string, status: ArticleStatus, expectedVersion: number) {
  const supabase = await createSupabaseServerClient();

  try {
    const { data, error } = await supabase
        .from("knowledge_base_articles")
        .update({ status, version: expectedVersion + 1 })
        .eq("id", id)
        .eq("version", expectedVersion)
        .select()
        .single();

    if (error) {
      if (error.code === "PGRST116") return { error: "Конфликт версий при изменении статуса." };
      throw error;
    }

    revalidatePath("/knowledge-base");
    return { data };
  } catch (err: any) {
    console.error("Knowledge Base Status Error:", err);
    return { error: err.message || "Ошибка при изменении статуса" };
  }
}
