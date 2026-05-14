import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentManager } from "./manager-utils";
import { FlashStatus } from "./flash-cookie";
import {
  BotOption,
  ChatInboxCursor,
  ChatInboxPage,
  ChatInboxPageInfo,
  ChatMessage,
  ChatStatus,
  ChatSummary,
  Manager,
  MessageSenderType,
  PageProps,
  SupportAdminPageData,
  coerceManagerRole,
} from "./page-types";
import {
  getBotKey,
  getBotLabel,
  getFullName,
  getMessagePreview,
  getPersonName,
  getSingleValue,
  getStatusMessage,
  sortChatMessages,
} from "./page-utils";

export const chatInboxPageLimit = 50;

type InboxSummaryRow = {
  id: string;
  telegram_chat_id: number;
  bot_username: string;
  status: ChatStatus;
  client_telegram_user_id: number;
  client_username: string | null;
  client_first_name: string | null;
  client_last_name: string | null;
  assigned_manager_id: string | null;
  assigned_manager_display_name: string | null;
  assigned_manager_last_name: string | null;
  last_message_at: string | null;
  last_message_text: string | null;
  last_message_sender_type: MessageSenderType | null;
  last_read_at: string | null;
  unread_count: number;
  message_count: number;
  created_at: string;
  updated_at: string;
};

type BotStatsRow = {
  bot_username: string;
  chat_count: number;
  message_count: number;
};

type ChatMessageRow = {
  id: string;
  chat_id: string;
  sender_type: MessageSenderType;
  manager_id: string | null;
  text: string;
  delivery_status: "pending" | "sent" | "failed" | null;
  delivery_error: string | null;
  client_message_id: string | null;
  legacy_message_id: number | null;
  created_at: string;
};

const emptyInboxPageInfo: ChatInboxPageInfo = {
  hasMore: false,
  nextCursor: null,
};

function getStatusVariant(status?: FlashStatus) {
  if (status === "delete-error") {
    return "error";
  }

  if (status === "message-deleted" || status === "chat-deleted") {
    return "success";
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function mapInboxSummary(row: InboxSummaryRow): ChatSummary {
  const assignedManagerName = [row.assigned_manager_display_name, row.assigned_manager_last_name]
    .filter(Boolean)
    .join(" ");

  return {
    id: row.id,
    telegramChatId: row.telegram_chat_id,
    botUsername: row.bot_username,
    status: row.status,
    title: getPersonName({
      username: row.client_username,
      firstName: row.client_first_name,
      lastName: row.client_last_name,
    }),
    fullName: getFullName({
      firstName: row.client_first_name,
      lastName: row.client_last_name,
    }),
    subtitle: getMessagePreview(row.last_message_text),
    username: row.client_username,
    assignedManagerId: row.assigned_manager_id,
    assignedManagerName: assignedManagerName || null,
    telegramUserId: row.client_telegram_user_id,
    lastMessageAt: row.last_message_at,
    lastReadAt: row.last_read_at,
    unreadCount: row.unread_count,
    messageCount: row.message_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChatMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    chatId: row.chat_id,
    senderType: row.sender_type,
    managerId: row.manager_id,
    text: row.text,
    deliveryStatus: row.delivery_status,
    deliveryError: row.delivery_error,
    clientMessageId: row.client_message_id,
    legacyMessageId: row.legacy_message_id,
    createdAt: row.created_at,
  };
}

function mapBotStats(rows: BotStatsRow[]) {
  return rows
    .map((row) => ({
      botUsername: row.bot_username,
      chatCount: row.chat_count,
      messageCount: row.message_count,
      option: {
        key: getBotKey(row.bot_username),
        label: getBotLabel(row.bot_username),
        value: row.bot_username,
      } satisfies BotOption,
    }))
    .sort((left, right) =>
      left.option.label.localeCompare(right.option.label, "ru", { sensitivity: "base" }),
    );
}

function isChatInboxCursor(value: unknown): value is ChatInboxCursor {
  if (!isRecord(value)) return false;

  return (
    (typeof value.lastMessageAt === "string" || value.lastMessageAt === null) &&
    typeof value.createdAt === "string" &&
    typeof value.chatId === "string"
  );
}

function mapInboxPageInfo(value: unknown): ChatInboxPageInfo {
  if (!isRecord(value) || typeof value.hasMore !== "boolean") {
    return emptyInboxPageInfo;
  }

  const nextCursor = value.nextCursor;

  return {
    hasMore: value.hasMore,
    nextCursor: value.hasMore && isChatInboxCursor(nextCursor) ? nextCursor : null,
  };
}

export function mapInboxPage(value: unknown): ChatInboxPage {
  if (!isRecord(value) || !Array.isArray(value.rows)) {
    return {
      rows: [],
      pageInfo: emptyInboxPageInfo,
    };
  }

  return {
    rows: (value.rows as InboxSummaryRow[]).map(mapInboxSummary),
    pageInfo: mapInboxPageInfo(value.pageInfo),
  };
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

  let chatSummaries: ChatSummary[] = [];
  let selectedChatMessages: ChatMessage[] = [];
  let selectedChat: ChatSummary | null = null;
  let chatInboxPageInfo: ChatInboxPageInfo = emptyInboxPageInfo;
  let errorMessage: string | null = null;
  let allManagers: Manager[] = [];
  let currentManager: Manager | null = null;
  let botOptions: BotOption[] = [];
  let selectedBot: BotOption | null = null;
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
      const botStats = mapBotStats((botStatsData ?? []) as BotStatsRow[]);
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
          p_limit: chatInboxPageLimit,
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
        const inboxPage = mapInboxPage(inboxPageData);
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
          selectedChat = row ? mapInboxSummary(row) : null;
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
        selectedChatMessages = sortChatMessages(
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
