"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/shared/api/supabase/server-client";

function getActionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error occurred";
}

export async function transferChatAction(chatId: string, targetManagerId: string, expectedFromManagerId?: string | null) {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("transfer_chat", {
      p_chat_id: chatId,
      p_target_manager_id: targetManagerId,
      p_expected_from_manager_id: expectedFromManagerId,
    });

    if (error) {
      console.error("Error in transferChatAction:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    console.error("Failed to transfer chat:", err);
    return { success: false, error: getActionErrorMessage(err) };
  }
}
