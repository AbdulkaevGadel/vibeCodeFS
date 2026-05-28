import {
  mapSupportChatInboxSummary,
  type InboxSummaryRow,
  type SupportChatBotOption,
  type SupportChatSummary,
} from "@/entities/support-chat";
import type { SupabaseServerClient } from "./types";

export type SelectedSupportChatResult = {
  selectedChat: SupportChatSummary | null;
  errorMessage: string | null;
};

export async function loadSelectedSupportChat(
  supabase: SupabaseServerClient,
  chatSummaries: SupportChatSummary[],
  selectedChatParam: string,
  selectedBot: SupportChatBotOption | null,
): Promise<SelectedSupportChatResult> {
  const chatFromCurrentPage =
    chatSummaries.find((chat) => chat.id === selectedChatParam) ?? null;

  if (chatFromCurrentPage) {
    return {
      selectedChat: chatFromCurrentPage,
      errorMessage: null,
    };
  }

  let selectedChatQuery = supabase
    .from("support_admin_chat_inbox_summary")
    .select("*")
    .eq("id", selectedChatParam)
    .limit(1);

  if (selectedBot?.value) {
    selectedChatQuery = selectedChatQuery.eq("bot_username", selectedBot.value);
  }

  const { data, error } = await selectedChatQuery;

  if (error) {
    console.error("Fetch selected chat summary error:", error);

    return {
      selectedChat: null,
      errorMessage: "Не удалось загрузить выбранный чат.",
    };
  }

  const row = (data ?? [])[0] as InboxSummaryRow | undefined;

  return {
    selectedChat: row ? mapSupportChatInboxSummary(row) : null,
    errorMessage: null,
  };
}
