import { createSupabaseServerClient } from "@/shared/api/supabase/server-client";
import {
  type SupportChatBotOption,
  emptySupportChatInboxPageInfo,
  type SupportChatInboxPageInfo,
  type SupportChatSummary,
} from "@/entities/support-chat";
import type { ChatMessage } from "@/entities/chat-message";
import type { Manager } from "@/entities/manager";
import { getCurrentManager } from "@/entities/manager/api/current-manager";
import { FlashStatus } from "./flash-cookie";
import {
  PageProps,
  SupportAdminPageData,
} from "./page-types";
import {
  getSingleValue,
  getStatusMessage,
} from "./page-utils";
import { loadSupportInboxBotStats } from "./support-inbox-data/bot-stats";
import { loadSupportInboxPage } from "./support-inbox-data/inbox-page";
import { loadSupportInboxManagers } from "./support-inbox-data/managers";
import { loadSelectedSupportChat } from "./support-inbox-data/selected-chat";
import { loadSelectedSupportChatMessages } from "./support-inbox-data/selected-chat-messages";
import { getSupportInboxStatusVariant } from "./support-inbox-data/status";

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Неизвестная ошибка";
}

export async function getSupportAdminPageData(
  searchParams: Awaited<PageProps["searchParams"]>,
  flashStatus?: FlashStatus,
): Promise<SupportAdminPageData> {
  const params = searchParams ?? {};
  const selectedBotParam = getSingleValue(params.bot);
  const selectedChatParam = getSingleValue(params.chat);

  let chatSummaries: SupportChatSummary[] = [];
  let selectedChatMessages: ChatMessage[] = [];
  let selectedChat: SupportChatSummary | null = null;
  let chatInboxPageInfo: SupportChatInboxPageInfo = emptySupportChatInboxPageInfo;
  let errorMessage: string | null = null;
  let allManagers: Manager[] = [];
  let currentManager: Manager | null = null;
  let botOptions: SupportChatBotOption[] = [];
  let selectedBot: SupportChatBotOption | null = null;
  let botFilteredChatCount = 0;
  let botFilteredMessageCount = 0;

  try {
    const supabase = await createSupabaseServerClient();

    try {
      currentManager = await getCurrentManager();
    } catch (error) {
      errorMessage = `Ошибка авторизации: ${formatErrorMessage(error)}`;
    }

    allManagers = await loadSupportInboxManagers(supabase);

    const botStats = await loadSupportInboxBotStats(supabase, selectedBotParam);
    botOptions = botStats.botOptions;
    selectedBot = botStats.selectedBot;
    botFilteredChatCount = botStats.botFilteredChatCount;
    botFilteredMessageCount = botStats.botFilteredMessageCount;
    errorMessage = errorMessage ?? botStats.errorMessage;

    if (!errorMessage) {
      const inboxPage = await loadSupportInboxPage(supabase, selectedBot);
      chatSummaries = inboxPage.chatSummaries;
      chatInboxPageInfo = inboxPage.chatInboxPageInfo;
      errorMessage = inboxPage.errorMessage;
    }

    if (selectedChatParam && !errorMessage) {
      const selectedChatResult = await loadSelectedSupportChat(
        supabase,
        chatSummaries,
        selectedChatParam,
        selectedBot,
      );
      selectedChat = selectedChatResult.selectedChat;
      errorMessage = selectedChatResult.errorMessage;
    }

    if (selectedChat && !errorMessage) {
      const messagesResult = await loadSelectedSupportChatMessages(supabase, selectedChat.id);
      selectedChatMessages = messagesResult.selectedChatMessages;
      errorMessage = messagesResult.errorMessage;
    }
  } catch (error) {
    errorMessage = "Ошибка при загрузке данных.";
    console.error(error);
  }

  return {
    botOptions,
    selectedBot,
    botFilteredChats: chatSummaries,
    botFilteredChatCount,
    botFilteredMessageCount,
    chatSummaries,
    chatInboxPageInfo,
    selectedChat,
    selectedChatMessages,
    allManagers,
    currentManager,
    statusMessage: getStatusMessage(flashStatus),
    statusVariant: getSupportInboxStatusVariant(flashStatus),
    errorMessage,
    headerBotLabel: selectedBot?.label || "Нет данных по ботам",
  };
}
