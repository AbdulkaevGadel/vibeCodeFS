import { BotOption, ChatMessage, ChatSummary, SearchParamValue } from "./page-types";

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

export function getPersonName(person: {
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}) {
  if (person.username?.trim()) {
    return `@${person.username}`;
  }

  const fullName = [person.firstName, person.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || "Без имени";
}

export function getFullName(person: { firstName: string | null; lastName: string | null }) {
  const fullName = [person.firstName, person.lastName]
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

export function buildBotOptions(chats: ChatSummary[]) {
  const botMap = new Map<string, BotOption>();

  for (const chat of chats) {
    const key = getBotKey(chat.botUsername);

    if (!botMap.has(key)) {
      botMap.set(key, {
        key,
        label: getBotLabel(chat.botUsername),
        value: chat.botUsername,
      });
    }
  }

  return Array.from(botMap.values()).sort((left, right) =>
    left.label.localeCompare(right.label, "ru", { sensitivity: "base" }),
  );
}

export function buildChatMessagesByChatId(messages: ChatMessage[]) {
  return messages.reduce<Record<string, ChatMessage[]>>((acc, message) => {
    const chatMessages = acc[message.chatId] ?? [];
    acc[message.chatId] = [...chatMessages, message];
    return acc;
  }, {});
}

export function sortChatMessages(messages: ChatMessage[]) {
  return [...messages].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export function getQueryString(botKey: string | null, chatId?: string | null) {
  const params = new URLSearchParams();

  if (botKey) {
    params.set("bot", botKey);
  }

  if (chatId) {
    params.set("chat", chatId);
  }

  const query = params.toString();
  return query ? `/?${query}` : "/";
}
