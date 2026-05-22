"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";

function getActionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error occurred";
}

export async function sendManagerMessageAction(chatId: string, text: string, clientMessageId: string) {
  try {
    const supabase = await createSupabaseServerClient();

    const { error: rpcError } = await supabase.rpc("process_manager_outcoming_message", {
      p_chat_id: chatId,
      p_text: text,
      p_client_message_id: clientMessageId,
    });

    if (rpcError) {
      console.error("RPC Error in sendManagerMessageAction:", rpcError);
      return { success: false, error: rpcError.message };
    }

    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    console.error("Failed to send manager message:", err);
    return { success: false, error: getActionErrorMessage(err) };
  }
}
