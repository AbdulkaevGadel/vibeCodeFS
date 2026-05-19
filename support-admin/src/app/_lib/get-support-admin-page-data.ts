import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  type SupportChatBotOption,
  emptySupportChatInboxPageInfo,
  supportChatInboxPageLimit,
  type SupportChatInboxPageInfo,
  type SupportChatSummary,
  mapSupportChatBotStats,
  mapSupportChatInboxPage,
  mapSupportChatInboxSummary,
  type BotStatsRow,
  type InboxSummaryRow,
} from "@/entities/support-chat";
import {
  mapChatMessage,
  sortMessagesByCreatedAt,
  type ChatMessage,
  type ChatMessageRow,
} from "@/entities/chat-message";
import { getCurrentManager } from "./manager-utils";
import { FlashStatus } from "./flash-cookie";
import {
  Manager,
  PageProps,
  SupportAdminPageData,
  coerceManagerRole,
} from "./page-types";
import {
  getSingleValue,
  getStatusMessage,
} from "./page-utils";

function getStatusVariant(status?: FlashStatus) {
  if (status === "delete-error") {
    return "error";
  }

  if (status === "message-deleted" || status === "chat-deleted") {
    return "success";
  }

  return null;
}

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

    const { data: managersAllData, error: managersAllError } = await supabase
      .from("managers")
      .select("id, email, display_name, last_name, role")
      .order("display_name");

    if (managersAllError) {
      console.error("Fetch managers error:", managersAllError);
    } else {
      allManagers = (managersAllData ?? []).map((manager) => ({
        id: manager.id,
        email: manager.email,
        displayName: manager.display_name,
        lastName: manager.last_name,
        role: coerceManagerRole(manager.role),
      }));
    }

    const { data: botStatsData, error: botStatsError } = await supabase
      .from("support_admin_bot_stats")
      .select("bot_username, chat_count, message_count")
      .order("bot_username");

    if (botStatsError) {
      console.error("Fetch support admin bot stats error:", botStatsError);
      errorMessage = errorMessage ?? "Не удалось загрузить статистику inbox.";
    } else {
      const botStats = mapSupportChatBotStats((botStatsData ?? []) as BotStatsRow[]);
      botOptions = botStats.map((stat) => stat.option);
      selectedBot =
        botOptions.find((bot) => bot.key === selectedBotParam) ?? botOptions[0] ?? null;

      const selectedBotKey = selectedBot?.key ?? null;
      const selectedBotStats = selectedBotKey
        ? botStats.find((stat) => stat.option.key === selectedBotKey) ?? null
        : null;
      botFilteredChatCount = selectedBotStats?.chatCount ?? 0;
      botFilteredMessageCount = selectedBotStats?.messageCount ?? 0;
    }

    if (!errorMessage) {
      const { data: inboxPageData, error: inboxPageError } = await supabase.rpc(
        "get_support_admin_chat_inbox_page",
        {
          p_limit: supportChatInboxPageLimit,
          p_cursor_last_message_at: null,
          p_cursor_created_at: null,
          p_cursor_chat_id: null,
          p_bot_username: selectedBot?.value ?? null,
        },
      );

      if (inboxPageError) {
        console.error("Fetch support admin inbox page error:", inboxPageError);
        errorMessage = "Не удалось загрузить inbox из read model.";
      } else {
        const inboxPage = mapSupportChatInboxPage(inboxPageData);
        chatSummaries = inboxPage.rows;
        chatInboxPageInfo = inboxPage.pageInfo;
      }
    }

    if (selectedChatParam && !errorMessage) {
      selectedChat = chatSummaries.find((chat) => chat.id === selectedChatParam) ?? null;

      if (!selectedChat) {
        let selectedChatQuery = supabase
          .from("support_admin_chat_inbox_summary")
          .select("*")
          .eq("id", selectedChatParam)
          .limit(1);

        if (selectedBot?.value) {
          selectedChatQuery = selectedChatQuery.eq("bot_username", selectedBot.value);
        }

        const { data: selectedChatData, error: selectedChatError } = await selectedChatQuery;

        if (selectedChatError) {
          console.error("Fetch selected chat summary error:", selectedChatError);
          errorMessage = "Не удалось загрузить выбранный чат.";
        } else {
          const row = (selectedChatData ?? [])[0] as InboxSummaryRow | undefined;
          selectedChat = row ? mapSupportChatInboxSummary(row) : null;
        }
      }
    }

    if (selectedChat && !errorMessage) {
      const { data: chatMessagesData, error: chatMessagesError } = await supabase
        .from("chat_messages")
        .select(
          "id, chat_id, sender_type, manager_id, text, delivery_status, delivery_error, client_message_id, legacy_message_id, created_at",
        )
        .eq("chat_id", selectedChat.id)
        .order("created_at", { ascending: true });

      if (chatMessagesError) {
        console.error("Fetch selected chat messages error:", chatMessagesError);
        errorMessage = "Не удалось загрузить сообщения выбранного чата.";
      } else {
        selectedChatMessages = sortMessagesByCreatedAt(
          ((chatMessagesData ?? []) as ChatMessageRow[]).map(mapChatMessage),
        );
      }
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
    statusVariant: getStatusVariant(flashStatus),
    errorMessage,
    headerBotLabel: selectedBot?.label || "Нет данных по ботам",
  };
}
