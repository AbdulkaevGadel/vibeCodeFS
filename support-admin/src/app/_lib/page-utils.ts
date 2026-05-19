import { SearchParamValue } from "./page-types";

export function getSingleValue(value: SearchParamValue) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
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
