"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";

function getActionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error occurred";
}

export async function takeChatIntoWorkAction(chatId: string) {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("take_chat_into_work", {
      p_chat_id: chatId,
    });

    if (error) {
      console.error("Error in takeChatIntoWorkAction:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    console.error("Failed to take chat into work:", err);
    return { success: false, error: getActionErrorMessage(err) };
  }
}
