"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/shared/api/supabase/server-client";

function getActionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error occurred";
}

export async function deleteChatAction(chatId: string) {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("delete_chat_admin", {
      p_chat_id: chatId,
    });

    if (error) {
      console.error("Error in deleteChatAction:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    console.error("Failed to delete chat:", err);
    return { success: false, error: getActionErrorMessage(err) };
  }
}
