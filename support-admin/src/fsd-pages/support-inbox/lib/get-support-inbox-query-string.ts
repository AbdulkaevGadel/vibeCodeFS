export function getSupportInboxQueryString(botKey: string | null, chatId?: string | null) {
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
