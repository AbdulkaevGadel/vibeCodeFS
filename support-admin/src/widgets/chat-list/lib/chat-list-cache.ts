import { sortSupportChatsByActivity, type SupportChatInboxPageInfo, type SupportChatSummary } from "@/entities/support-chat";

export type CachedChatListState = {
  chats: SupportChatSummary[];
  pageInfo: SupportChatInboxPageInfo;
  hasLoadedAdditionalPages: boolean;
};

function getChatListStorageKey(botUsername: string | null) {
  return `support-admin:chat-list:${botUsername ?? "all"}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isChatSummary(value: unknown): value is SupportChatSummary {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.telegramChatId === "number" &&
    typeof value.botUsername === "string" &&
    typeof value.status === "string" &&
    typeof value.title === "string" &&
    typeof value.subtitle === "string" &&
    typeof value.telegramUserId === "number" &&
    (typeof value.lastMessageAt === "string" || value.lastMessageAt === null) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isChatInboxPageInfo(value: unknown): value is SupportChatInboxPageInfo {
  if (!isRecord(value) || typeof value.hasMore !== "boolean") return false;

  if (value.nextCursor === null) return true;
  if (!isRecord(value.nextCursor)) return false;

  return (
    (typeof value.nextCursor.lastMessageAt === "string" ||
      value.nextCursor.lastMessageAt === null) &&
    typeof value.nextCursor.createdAt === "string" &&
    typeof value.nextCursor.chatId === "string"
  );
}

export function readCachedChatListState(botUsername: string | null): CachedChatListState | null {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.sessionStorage.getItem(getChatListStorageKey(botUsername));
    if (!rawValue) return null;

    const parsedValue: unknown = JSON.parse(rawValue);
    if (!isRecord(parsedValue)) return null;
    if (!Array.isArray(parsedValue.chats)) return null;
    if (!isChatInboxPageInfo(parsedValue.pageInfo)) return null;
    if (typeof parsedValue.hasLoadedAdditionalPages !== "boolean") return null;

    const cachedChats = parsedValue.chats.filter(isChatSummary);
    if (cachedChats.length !== parsedValue.chats.length) return null;

    return {
      chats: cachedChats,
      pageInfo: parsedValue.pageInfo,
      hasLoadedAdditionalPages: parsedValue.hasLoadedAdditionalPages,
    };
  } catch (error) {
    console.error("Read cached chat list state error:", error);
    return null;
  }
}

export function writeCachedChatListState(botUsername: string | null, state: CachedChatListState) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(getChatListStorageKey(botUsername), JSON.stringify(state));
  } catch (error) {
    console.error("Write cached chat list state error:", error);
  }
}

export function mergeChatPages(currentChats: SupportChatSummary[], nextChats: SupportChatSummary[]) {
  const seenIds = new Set<string>();
  const mergedChats: SupportChatSummary[] = [];

  for (const chat of [...currentChats, ...nextChats]) {
    if (seenIds.has(chat.id)) continue;

    seenIds.add(chat.id);
    mergedChats.push(chat);
  }

  return sortSupportChatsByActivity(mergedChats);
}
