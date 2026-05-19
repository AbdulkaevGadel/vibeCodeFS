import type { SupportChatSummary } from "../model";

const unknownBotKey = "__unknown_bot__";

export function getBotKey(botUsername: string | null) {
  return botUsername?.trim() || unknownBotKey;
}

export function getBotLabel(botUsername: string | null) {
  return botUsername?.trim() ? `@${botUsername}` : "Без имени бота";
}

function compareNullableDatesDesc(left: string | null, right: string | null) {
  if (left && right) return new Date(right).getTime() - new Date(left).getTime();
  if (left && !right) return -1;
  if (!left && right) return 1;
  return 0;
}

export function sortSupportChatsByActivity(chats: SupportChatSummary[]) {
  return [...chats].sort((left, right) => {
    const lastMessageCompare = compareNullableDatesDesc(left.lastMessageAt, right.lastMessageAt);
    if (lastMessageCompare !== 0) return lastMessageCompare;

    const createdAtCompare = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    if (createdAtCompare !== 0) return createdAtCompare;

    return left.id.localeCompare(right.id);
  });
}
