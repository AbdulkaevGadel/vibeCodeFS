import {
  mapChatMessage,
  sortMessagesByCreatedAt,
  type ChatMessage,
  type ChatMessageRow,
} from "@/entities/chat-message";
import type { SupabaseServerClient } from "./types";

export type SelectedSupportChatMessagesResult = {
  selectedChatMessages: ChatMessage[];
  errorMessage: string | null;
};

export async function loadSelectedSupportChatMessages(
  supabase: SupabaseServerClient,
  chatId: string,
): Promise<SelectedSupportChatMessagesResult> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select(
      "id, chat_id, sender_type, manager_id, text, delivery_status, delivery_error, client_message_id, legacy_message_id, created_at",
    )
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Fetch selected chat messages error:", error);

    return {
      selectedChatMessages: [],
      errorMessage: "Не удалось загрузить сообщения выбранного чата.",
    };
  }

  return {
    selectedChatMessages: sortMessagesByCreatedAt(
      ((data ?? []) as ChatMessageRow[]).map(mapChatMessage),
    ),
    errorMessage: null,
  };
}
