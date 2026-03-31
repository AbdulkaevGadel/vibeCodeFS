import { BotOption, ChatSummary, Message, SearchParamValue } from "./page-types";

const unknownBotKey = "__unknown_bot__";

export function getSingleValue(value: SearchParamValue) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function getBotKey(botUsername: string | null) {
  return botUsername?.trim() || unknownBotKey;
}

export function getBotLabel(botUsername: string | null) {
  return botUsername?.trim() ? `@${botUsername}` : "Без имени бота";
}

export function getPersonName(
  message: Pick<Message, "username" | "first_name" | "last_name">,
) {
  if (message.username?.trim()) {
    return `@${message.username}`;
  }

  const fullName = [message.first_name, message.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || "Без имени";
}

export function getFullName(message: Pick<Message, "first_name" | "last_name">) {
  const fullName = [message.first_name, message.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || null;
}

export function getMessagePreview(text: string | null) {
  if (!text?.trim()) {
    return "Без текста";
  }

  return text.length > 72 ? `${text.slice(0, 72)}...` : text;
}

export function getStatusMessage(status: string | undefined) {
  if (status === "message-deleted") {
    return "Сообщение удалено.";
  }

  if (status === "chat-deleted") {
    return "Чат удалён из списка вместе со всеми сообщениями.";
  }

  if (status === "delete-error") {
    return "Удаление не выполнено. Проверь серверные env-переменные Supabase.";
  }

  return null;
}

export function buildBotOptions(messages: Message[]) {
  const botMap = new Map<string, BotOption>();

  for (const message of messages) {
    const key = getBotKey(message.bot_username);

    if (!botMap.has(key)) {
      botMap.set(key, {
        key,
        label: getBotLabel(message.bot_username),
        value: message.bot_username,
      });
    }
  }

  return Array.from(botMap.values()).sort((left, right) =>
    left.label.localeCompare(right.label, "ru", { sensitivity: "base" }),
  );
}

export function buildChatSummaries(messages: Message[]) {
  const chatMap = new Map<number, ChatSummary>();

  for (const message of messages) {
    const existingChat = chatMap.get(message.chat_id);
    const title = getPersonName(message);
    const fullName = getFullName(message);
    const subtitle = getMessagePreview(message.text);

    if (!existingChat) {
      chatMap.set(message.chat_id, {
        chatId: message.chat_id,
        title,
        fullName,
        subtitle,
        username: message.username,
        lastMessageAt: message.created_at,
        messageCount: 1,
      });
      continue;
    }

    existingChat.messageCount += 1;

    if (new Date(message.created_at).getTime() > new Date(existingChat.lastMessageAt).getTime()) {
      existingChat.lastMessageAt = message.created_at;
      existingChat.subtitle = subtitle;
    }
  }

  return Array.from(chatMap.values()).sort((left, right) => {
    const titleCompare = left.title.localeCompare(right.title, "ru", { sensitivity: "base" });

    if (titleCompare !== 0) {
      return titleCompare;
    }

    return left.chatId - right.chatId;
  });
}

export function getQueryString(botKey: string | null, chatId?: number | null) {
  const params = new URLSearchParams();

  if (botKey) {
    params.set("bot", botKey);
  }

  if (chatId) {
    params.set("chat", String(chatId));
  }

  const query = params.toString();
  return query ? `/?${query}` : "/";
}
