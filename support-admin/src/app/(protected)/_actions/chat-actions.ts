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

export async function sendManagerMessageAction(chatId: string, text: string, clientMessageId: string) {
  try {
    const supabase = await createSupabaseServerClient();
    
    // 1. Вызываем RPC для сохранения сообщения и получения данных для отправки
    const { data, error: rpcError } = await supabase.rpc("process_manager_outcoming_message", {
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
  } catch (err: any) {
    console.error("Failed to send manager message:", err);
    return { success: false, error: err.message || "Unknown error occurred" };
  }
}

export async function resolveChatAction(chatId: string) {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("resolve_chat", {
      p_chat_id: chatId,
    });

    if (error) {
      console.error("Error in resolveChatAction:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/");
    return { success: true };
  } catch (err: any) {
    console.error("Failed to resolve chat:", err);
    return { success: false, error: err.message || "Unknown error occurred" };
  }
}

export async function transferChatAction(chatId: string, targetManagerId: string) {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("transfer_chat", {
      p_chat_id: chatId,
      p_target_manager_id: targetManagerId,
    });

    if (error) {
      console.error("Error in transferChatAction:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/");
    return { success: true };
  } catch (err: any) {
    console.error("Failed to transfer chat:", err);
    return { success: false, error: err.message || "Unknown error occurred" };
  }
}

export async function updateChatStatusAction(chatId: string, newStatus: string) {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("update_chat_status", {
      p_chat_id: chatId,
      p_new_status: newStatus,
    });

    if (error) {
      console.error("Error in updateChatStatusAction:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/");
    return { success: true };
  } catch (err: any) {
    console.error("Failed to update chat status:", err);
    return { success: false, error: err.message || "Unknown error occurred" };
  }
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
  } catch (err: any) {
    console.error("Failed to delete message:", err);
    return { success: false, error: err.message || "Unknown error occurred" };
  }
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
  } catch (err: any) {
    console.error("Failed to delete chat:", err);
    return { success: false, error: err.message || "Unknown error occurred" };
  }
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

    // No revalidatePath needed here to avoid extra list refreshes, 
    // unless we want to force a server recount.
    // However, the realtime UPDATE on 'chats' will handle the UI reset.
    return { success: true };
  } catch (err: any) {
    console.error("Failed to mark chat as read:", err);
    return { success: false, error: err.message || "Unknown error occurred" };
  }
}
