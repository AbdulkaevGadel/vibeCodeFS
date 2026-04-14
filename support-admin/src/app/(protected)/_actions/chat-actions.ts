"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentManagerId } from "../../_lib/manager-utils";
import { revalidatePath } from "next/cache";

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
  } catch (err: any) {
    console.error("Failed to take chat into work:", err);
    return { success: false, error: err.message || "Unknown error occurred" };
  }
}
