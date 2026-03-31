import { createSupabaseClient } from "@/lib/supabase";
import { PageProps, Message, SupportAdminPageData } from "./page-types";
import {
  buildBotOptions,
  buildChatSummaries,
  getBotKey,
  getSingleValue,
  getStatusMessage,
} from "./page-utils";
import { FlashStatus } from "./flash-cookie";

function getStatusVariant(status?: FlashStatus) {
  if (status === "delete-error") {
    return "error";
  }

  if (status === "message-deleted" || status === "chat-deleted") {
    return "success";
  }

  return null;
}

export async function getSupportAdminPageData(
  searchParams: Awaited<PageProps["searchParams"]>,
  flashStatus?: FlashStatus,
): Promise<SupportAdminPageData> {
  const params = searchParams ?? {};
  const selectedBotParam = getSingleValue(params.bot);
  const selectedChatParam = getSingleValue(params.chat);

  let messages: Message[] = [];
  let errorMessage: string | null = null;

  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      errorMessage = "Не удалось загрузить сообщения.";
      console.error(error);
    } else {
      messages = (data ?? []) as Message[];
    }
  } catch (error) {
    errorMessage = "Проверь NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY.";
    console.error(error);
  }

  const botOptions = buildBotOptions(messages);
  const selectedBot =
    botOptions.find((bot) => bot.key === selectedBotParam) ?? botOptions[0] ?? null;
  const botFilteredMessages = selectedBot
    ? messages.filter((message) => getBotKey(message.bot_username) === selectedBot.key)
    : messages;
  const chatSummaries = buildChatSummaries(botFilteredMessages);
  const selectedChatId = Number(selectedChatParam);
  const selectedChat =
    chatSummaries.find((chat) => chat.chatId === selectedChatId) ?? chatSummaries[0] ?? null;
  const selectedChatMessages = selectedChat
    ? botFilteredMessages
        .filter((message) => message.chat_id === selectedChat.chatId)
        .sort(
          (left, right) =>
            new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
        )
    : [];

  return {
    botOptions,
    selectedBot,
    botFilteredMessages,
    chatSummaries,
    selectedChat,
    selectedChatMessages,
    statusMessage: getStatusMessage(flashStatus),
    statusVariant: getStatusVariant(flashStatus),
    errorMessage,
    headerBotLabel: selectedBot?.label || "Нет данных по ботам",
  };
}
