import {
  emptySupportChatInboxPageInfo,
  mapSupportChatInboxPage,
  supportChatInboxPageLimit,
  type SupportChatBotOption,
  type SupportChatInboxPageInfo,
  type SupportChatSummary,
} from "@/entities/support-chat";
import type { SupabaseServerClient } from "./types";

export type SupportInboxPageLoadResult = {
  chatSummaries: SupportChatSummary[];
  chatInboxPageInfo: SupportChatInboxPageInfo;
  errorMessage: string | null;
};

export async function loadSupportInboxPage(
  supabase: SupabaseServerClient,
  selectedBot: SupportChatBotOption | null,
): Promise<SupportInboxPageLoadResult> {
  const { data, error } = await supabase.rpc("get_support_admin_chat_inbox_page", {
    p_limit: supportChatInboxPageLimit,
    p_cursor_last_message_at: null,
    p_cursor_created_at: null,
    p_cursor_chat_id: null,
    p_bot_username: selectedBot?.value ?? null,
  });

  if (error) {
    console.error("Fetch support admin inbox page error:", error);

    return {
      chatSummaries: [],
      chatInboxPageInfo: emptySupportChatInboxPageInfo,
      errorMessage: "Не удалось загрузить inbox из read model.",
    };
  }

  const inboxPage = mapSupportChatInboxPage(data);

  return {
    chatSummaries: inboxPage.rows,
    chatInboxPageInfo: inboxPage.pageInfo,
    errorMessage: null,
  };
}
