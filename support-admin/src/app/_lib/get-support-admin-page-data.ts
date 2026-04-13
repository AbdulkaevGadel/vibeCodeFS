import { createSupabaseClient } from "@/lib/supabase";
import { FlashStatus } from "./flash-cookie";
import { ChatMessage, ChatSummary, PageProps, SupportAdminPageData } from "./page-types";
import {
  buildBotOptions,
  buildChatMessagesByChatId,
  getBotKey,
  getFullName,
  getMessagePreview,
  getPersonName,
  getSingleValue,
  getStatusMessage,
  sortChatMessages,
} from "./page-utils";

type ChatRow = {
  id: string;
  telegram_chat_id: number;
  bot_username: string;
  status: string;
  created_at: string;
  updated_at: string;
  clients: {
    telegram_user_id: number;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

type ChatRowResponse = {
  id: string;
  telegram_chat_id: number;
  bot_username: string;
  status: string;
  created_at: string;
  updated_at: string;
  clients: Array<{
    telegram_user_id: number;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
  }> | null;
};

type ChatMessageRow = {
  id: string;
  chat_id: string;
  sender_type: "client" | "manager";
  manager_id: string | null;
  text: string;
  legacy_message_id: number | null;
  created_at: string;
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

function buildChatSummaries(chats: ChatRow[], messagesByChatId: Record<string, ChatMessage[]>) {
  return chats
    .map<ChatSummary>((chat) => {
      const client = chat.clients;
      const messages = sortChatMessages(messagesByChatId[chat.id] ?? []);
      const latestMessage = messages[0] ?? null;

      return {
        id: chat.id,
        telegramChatId: chat.telegram_chat_id,
        botUsername: chat.bot_username,
        status: chat.status,
        title: getPersonName({
          username: client?.username ?? null,
          firstName: client?.first_name ?? null,
          lastName: client?.last_name ?? null,
        }),
        fullName: getFullName({
          firstName: client?.first_name ?? null,
          lastName: client?.last_name ?? null,
        }),
        subtitle: getMessagePreview(latestMessage?.text ?? null),
        username: client?.username ?? null,
        telegramUserId: client?.telegram_user_id ?? 0,
        lastMessageAt: latestMessage?.createdAt ?? chat.updated_at,
        messageCount: messages.length,
        createdAt: chat.created_at,
        updatedAt: chat.updated_at,
      };
    })
    .sort((left, right) => {
      const titleCompare = left.title.localeCompare(right.title, "ru", { sensitivity: "base" });

      if (titleCompare !== 0) {
        return titleCompare;
      }

      return left.telegramChatId - right.telegramChatId;
    });
}

function normalizeChatRows(rows: ChatRowResponse[]) {
  return rows.map<ChatRow>((row) => ({
    id: row.id,
    telegram_chat_id: row.telegram_chat_id,
    bot_username: row.bot_username,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    clients: row.clients?.[0] ?? null,
  }));
}

export async function getSupportAdminPageData(
  searchParams: Awaited<PageProps["searchParams"]>,
  flashStatus?: FlashStatus,
): Promise<SupportAdminPageData> {
  const params = searchParams ?? {};
  const selectedBotParam = getSingleValue(params.bot);
  const selectedChatParam = getSingleValue(params.chat);

  let chats: ChatRow[] = [];
  let chatMessages: ChatMessage[] = [];
  let errorMessage: string | null = null;

  try {
    const supabase = createSupabaseClient();
    const { data: chatsData, error: chatsError } = await supabase
      .from("chats")
      .select(
        `
          id,
          telegram_chat_id,
          bot_username,
          status,
          created_at,
          updated_at,
          clients!inner(
            telegram_user_id,
            username,
            first_name,
            last_name
          )
        `,
      )
      .order("updated_at", { ascending: false });

    if (chatsError) {
      errorMessage = "Не удалось загрузить чаты из relational модели.";
      console.error(chatsError);
    } else {
      chats = normalizeChatRows((chatsData ?? []) as ChatRowResponse[]);
    }

    if (!errorMessage && chats.length > 0) {
      const chatIds = chats.map((chat) => chat.id);
      const { data: chatMessagesData, error: chatMessagesError } = await supabase
        .from("chat_messages")
        .select("id, chat_id, sender_type, manager_id, text, legacy_message_id, created_at")
        .in("chat_id", chatIds)
        .order("created_at", { ascending: false });

      if (chatMessagesError) {
        errorMessage = "Не удалось загрузить сообщения из relational модели.";
        console.error(chatMessagesError);
      } else {
        chatMessages = ((chatMessagesData ?? []) as ChatMessageRow[]).map((message) => ({
          id: message.id,
          chatId: message.chat_id,
          senderType: message.sender_type,
          managerId: message.manager_id,
          text: message.text,
          legacyMessageId: message.legacy_message_id,
          createdAt: message.created_at,
        }));
      }
    }
  } catch (error) {
    errorMessage = "Проверь NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY.";
    console.error(error);
  }

  const messagesByChatId = buildChatMessagesByChatId(chatMessages);
  const allChatSummaries = buildChatSummaries(chats, messagesByChatId);
  const botOptions = buildBotOptions(allChatSummaries);
  const selectedBot =
    botOptions.find((bot) => bot.key === selectedBotParam) ?? botOptions[0] ?? null;
  const botFilteredChats = selectedBot
    ? allChatSummaries.filter((chat) => getBotKey(chat.botUsername) === selectedBot.key)
    : allChatSummaries;
  const selectedChat =
    botFilteredChats.find((chat) => chat.id === selectedChatParam) ?? botFilteredChats[0] ?? null;
  const selectedChatMessages = selectedChat
    ? sortChatMessages(messagesByChatId[selectedChat.id] ?? [])
    : [];
  const botFilteredMessageCount = botFilteredChats.reduce(
    (total, chat) => total + chat.messageCount,
    0,
  );

  return {
    botOptions,
    selectedBot,
    botFilteredChats,
    botFilteredMessageCount,
    chatSummaries: botFilteredChats,
    selectedChat,
    selectedChatMessages,
    statusMessage: getStatusMessage(flashStatus),
    statusVariant: getStatusVariant(flashStatus),
    errorMessage,
    headerBotLabel: selectedBot?.label || "Нет данных по ботам",
  };
}
