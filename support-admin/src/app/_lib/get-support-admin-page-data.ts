import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentManager } from "./manager-utils";
import { FlashStatus } from "./flash-cookie";
import { ChatMessage, ChatSummary, Manager, PageProps, SupportAdminPageData } from "./page-types";
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
  assigned_manager_id: string | null;
  assigned_manager_name: string | null;
};

type ClientResponse = {
  telegram_user_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
};

type ChatRowResponse = {
  id: string;
  telegram_chat_id: number;
  bot_username: string;
  status: string;
  created_at: string;
  updated_at: string;
  clients: ClientResponse[] | ClientResponse | null;
  chat_assignments: Array<{ current_manager_id: string }> | { current_manager_id: string } | null;
};

type ChatMessageRow = {
  id: string;
  chat_id: string;
  sender_type: "client" | "manager";
  manager_id: string | null;
  text: string;
  delivery_status: "pending" | "sent" | "failed" | null;
  delivery_error: string | null;
  client_message_id: string | null;
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

function getManagerLabel(manager: Pick<Manager, "displayName" | "lastName">) {
  return [manager.displayName, manager.lastName].filter(Boolean).join(" ");
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
        assignedManagerId: chat.assigned_manager_id,
        assignedManagerName: chat.assigned_manager_name,
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

function normalizeChatRows(rows: ChatRowResponse[], managersMap: Record<string, Manager>) {
  return rows.map<ChatRow>((row) => {
    // Безопасное извлечение назначения
    const rawAssignment = row.chat_assignments;
    const assignment = Array.isArray(rawAssignment) ? rawAssignment[0] : rawAssignment;
    const mgrId = assignment?.current_manager_id;
    
    // Безопасное извлечение клиента
    const rawClient = row.clients;
    const client = Array.isArray(rawClient) ? rawClient[0] : rawClient;
    
    return {
      id: row.id,
      telegram_chat_id: row.telegram_chat_id,
      bot_username: row.bot_username,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      clients: (client as ClientResponse) || null,
      assigned_manager_id: mgrId ?? null,
      assigned_manager_name: mgrId && managersMap[mgrId] ? getManagerLabel(managersMap[mgrId]) : null,
    };
  });
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
  let allManagers: Manager[] = [];
  let currentManager: Manager | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    
    // 0. Fetch current manager
    try {
      currentManager = await getCurrentManager();
    } catch (e: any) {
      console.warn("Could not fetch current manager:", e);
      errorMessage = "Ошибка авторизации: не удалось загрузить профиль менеджера. " + e.message;
    }

    // 1. Fetch ALL managers
    const { data: managersAllData, error: managersAllError } = await supabase
      .from("managers")
      .select("id, email, display_name, last_name, role")
      .order("display_name");

    if (!managersAllError && managersAllData) {
      allManagers = managersAllData.map(m => ({
        id: m.id,
        email: m.email,
        displayName: m.display_name,
        lastName: m.last_name,
        role: m.role
      }));
    }

    // 2. Fetch chats
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
          ),
          chat_assignments(
            current_manager_id
          )
        `,
      )
      .order("updated_at", { ascending: false });

    if (chatsError) {
      errorMessage = "Не удалось загрузить чаты из relational модели.";
      console.error(chatsError);
    } else {
      const chatRows = (chatsData ?? []) as ChatRowResponse[];
      
      const managerIds = new Set<string>();
      chatRows.forEach((row) => {
        const rawAsgn = row.chat_assignments;
        const asgn = Array.isArray(rawAsgn) ? rawAsgn[0] : rawAsgn;
        const mgrId = asgn?.current_manager_id;
        if (mgrId) managerIds.add(mgrId);
      });

      let managersMap: Record<string, Manager> = {};
      if (managerIds.size > 0) {
        const { data: managersData, error: managersError } = await supabase
          .from("managers")
          .select("id, email, display_name, last_name, role")
          .in("id", Array.from(managerIds));

        if (!managersError && managersData) {
          managersMap = managersData.reduce((acc, mgr) => {
            acc[mgr.id] = {
              id: mgr.id,
              email: mgr.email,
              displayName: mgr.display_name,
              lastName: mgr.last_name,
              role: mgr.role,
            };
            return acc;
          }, {} as Record<string, Manager>);
        }
      }

      chats = normalizeChatRows(chatRows, managersMap);
    }

    if (!errorMessage && chats.length > 0) {
      const chatIds = chats.map((chat) => chat.id);
      const { data: chatMessagesData, error: chatMessagesError } = await supabase
        .from("chat_messages")
        .select("id, chat_id, sender_type, manager_id, text, delivery_status, delivery_error, client_message_id, legacy_message_id, created_at")
        .in("chat_id", chatIds)
        .order("created_at", { ascending: true });

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
          deliveryStatus: message.delivery_status,
          deliveryError: message.delivery_error,
          clientMessageId: message.client_message_id,
          legacyMessageId: message.legacy_message_id,
          createdAt: message.created_at,
        }));
      }
    }
  } catch (error) {
    errorMessage = "Ошибка при загрузке данных.";
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
    allManagers,
    currentManager,
    statusMessage: getStatusMessage(flashStatus),
    statusVariant: getStatusVariant(flashStatus),
    errorMessage,
    headerBotLabel: selectedBot?.label || "Нет данных по ботам",
  };
}
