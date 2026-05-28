"use server";

import { createSupabaseServerClient } from "@/shared/api/supabase/server-client";

function getActionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error occurred";
}

export async function markChatAsReadAction(chatId: string) {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("mark_chat_as_read", {
      p_chat_id: chatId,
    });

    if (error) {
      console.error("Error in markChatAsReadAction:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    console.error("Failed to mark chat as read:", err);
    return { success: false, error: getActionErrorMessage(err) };
  }
}
