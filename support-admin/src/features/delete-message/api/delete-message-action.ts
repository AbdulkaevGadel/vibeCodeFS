"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/shared/api/supabase/server-client";

function getActionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error occurred";
}

export async function deleteMessageAction(messageId: string) {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("delete_message", {
      p_message_id: messageId,
    });

    if (error) {
      console.error("Error in deleteMessageAction:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    console.error("Failed to delete message:", err);
    return { success: false, error: getActionErrorMessage(err) };
  }
}
