"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/shared/api/supabase/server-client";

function getActionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error occurred";
}

export async function updateChatStatusAction(chatId: string, newStatus: string, expectedStatus?: string | null) {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("update_chat_status", {
      p_chat_id: chatId,
      p_new_status: newStatus,
      p_expected_status: expectedStatus,
    });

    if (error) {
      console.error("Error in updateChatStatusAction:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    console.error("Failed to update chat status:", err);
    return { success: false, error: getActionErrorMessage(err) };
  }
}
