"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/button";
import { loadChatInboxPageAction } from "../(protected)/_actions/chat-inbox-actions";
import type { ChatInboxPageInfo, ChatSummary } from "../_lib/page-types";
import { ChatListItem } from "./chat-list-item";
import { sortChatsByActivity, useChatListRealtime } from "./chat-list-realtime";

type ChatListProps = {
  chatSummaries: ChatSummary[];
  chatInboxPageInfo: ChatInboxPageInfo;
  selectedChat: ChatSummary | null;
  selectedChatId: string | null;
  selectedBotKey: string | null;
  selectedBotUsername: string | null;
};

type CachedChatListState = {
  chats: ChatSummary[];
  pageInfo: ChatInboxPageInfo;
  hasLoadedAdditionalPages: boolean;
};

const panelClassName = "support-panel p-4";
const sectionTitleClassName = "support-text-muted text-xs uppercase tracking-[0.3em]";
const sectionHeadingClassName = "support-text-primary mt-2 text-xl font-semibold";
const emptyStateClassName =
  "support-text-secondary support-surface-muted rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm";
const pinnedLabelClassName = "support-text-muted mb-2 px-2 text-[10px] font-bold uppercase tracking-wider";
const pinnedDividerClassName = "mt-4 border-t border-slate-200";
const listStateClassName =
  "support-text-secondary support-surface-muted rounded-2xl border border-slate-200 px-4 py-3 text-sm";
const listErrorClassName =
  "rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700";

function getChatListStorageKey(botUsername: string | null) {
  return `support-admin:chat-list:${botUsername ?? "all"}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isChatSummary(value: unknown): value is ChatSummary {
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

function isChatInboxPageInfo(value: unknown): value is ChatInboxPageInfo {
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

function readCachedChatListState(botUsername: string | null): CachedChatListState | null {
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

function writeCachedChatListState(botUsername: string | null, state: CachedChatListState) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(getChatListStorageKey(botUsername), JSON.stringify(state));
  } catch (error) {
    console.error("Write cached chat list state error:", error);
  }
}

function mergeChatPages(currentChats: ChatSummary[], nextChats: ChatSummary[]) {
  const seenIds = new Set<string>();
  const mergedChats: ChatSummary[] = [];

  for (const chat of [...currentChats, ...nextChats]) {
    if (seenIds.has(chat.id)) continue;

    seenIds.add(chat.id);
    mergedChats.push(chat);
  }

  return sortChatsByActivity(mergedChats);
}

export function ChatList({
  chatSummaries,
  chatInboxPageInfo,
  selectedChat,
  selectedChatId,
  selectedBotKey,
  selectedBotUsername,
}: ChatListProps) {
  const router = useRouter();

  // state
  const [chats, setChats] = useState(() => sortChatsByActivity(chatSummaries));
  const [pageInfo, setPageInfo] = useState(chatInboxPageInfo);
  const [isLoadingNextPage, setIsLoadingNextPage] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  // refs (чтобы realtime видел актуальные значения)
  const chatsRef = useRef(chats);
  const pageInfoRef = useRef(pageInfo);
  const hasLoadedAdditionalPagesRef = useRef(false);
  const selectedBotUsernameRef = useRef(selectedBotUsername);
  const selectedChatIdRef = useRef(selectedChatId);
  const selectedBotKeyRef = useRef(selectedBotKey);
  const refreshList = useCallback(() => {
    router.refresh();
  }, [router]);

  // sync refs
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    pageInfoRef.current = pageInfo;
  }, [pageInfo]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  useEffect(() => {
    selectedBotKeyRef.current = selectedBotKey;
  }, [selectedBotKey]);

  // sync initial data from server
  useEffect(() => {
    const sorted = sortChatsByActivity(chatSummaries);
    const cached = readCachedChatListState(selectedBotUsername);

    if (selectedBotUsernameRef.current !== selectedBotUsername) {
      const nextChats = cached ? cached.chats : sorted;
      const nextPageInfo = cached?.pageInfo ?? chatInboxPageInfo;
      const hasLoadedAdditionalPages = cached?.hasLoadedAdditionalPages ?? false;

      selectedBotUsernameRef.current = selectedBotUsername;
      hasLoadedAdditionalPagesRef.current = hasLoadedAdditionalPages;
      chatsRef.current = nextChats;
      setChats(nextChats);
      setPageInfo(nextPageInfo);
      setLoadMoreError(null);
      setIsLoadingNextPage(false);
      return;
    }

    if (!hasLoadedAdditionalPagesRef.current && cached?.hasLoadedAdditionalPages) {
      const next = mergeChatPages(sorted, cached.chats);
      hasLoadedAdditionalPagesRef.current = true;
      chatsRef.current = next;
      setChats(next);
      setPageInfo(cached.pageInfo);
      setLoadMoreError(null);
      setIsLoadingNextPage(false);
      return;
    }

    if (hasLoadedAdditionalPagesRef.current) {
      const next = mergeChatPages(sorted, chatsRef.current);
      chatsRef.current = next;
      setChats(next);
      writeCachedChatListState(selectedBotUsername, {
        chats: next,
        pageInfo: pageInfoRef.current,
        hasLoadedAdditionalPages: true,
      });
      setLoadMoreError(null);
      setIsLoadingNextPage(false);
      return;
    }

    chatsRef.current = sorted;
    setChats(sorted);
    setPageInfo(chatInboxPageInfo);
    setLoadMoreError(null);
    setIsLoadingNextPage(false);
  }, [chatInboxPageInfo, chatSummaries, selectedBotUsername]);

  useChatListRealtime({
    chatsRef,
    selectedChatIdRef,
    selectedBotKeyRef,
    setChats,
    refreshList,
  });

  // Local reset when selecting a chat
  useEffect(() => {
    if (!selectedChatId) return;

    const next = chatsRef.current.map((chat) =>
        chat.id === selectedChatId
            ? { ...chat, unreadCount: 0 }
            : chat
    );

    chatsRef.current = next;
    setChats(next);
    writeCachedChatListState(selectedBotUsername, {
      chats: next,
      pageInfo: pageInfoRef.current,
      hasLoadedAdditionalPages: hasLoadedAdditionalPagesRef.current,
    });
  }, [selectedChatId]);

  const handleLoadMore = useCallback(async () => {
    if (isLoadingNextPage || !pageInfo.hasMore || !pageInfo.nextCursor) return;

    setIsLoadingNextPage(true);
    setLoadMoreError(null);

    const result = await loadChatInboxPageAction({
      botUsername: selectedBotUsername,
      cursor: pageInfo.nextCursor,
    });

    if (!result.success) {
      setLoadMoreError(result.error);
      setIsLoadingNextPage(false);
      return;
    }

    const nextChats = mergeChatPages(chatsRef.current, result.data.rows);
    hasLoadedAdditionalPagesRef.current = true;
    chatsRef.current = nextChats;
    setChats(nextChats);
    setPageInfo(result.data.pageInfo);
    writeCachedChatListState(selectedBotUsername, {
      chats: nextChats,
      pageInfo: result.data.pageInfo,
      hasLoadedAdditionalPages: true,
    });
    setIsLoadingNextPage(false);
  }, [isLoadingNextPage, pageInfo, selectedBotUsername]);

  const pinnedSelectedChat =
    selectedChat && !chats.some((chat) => chat.id === selectedChat.id) ? selectedChat : null;
  const showEndOfList = chats.length > 0 && !pageInfo.hasMore;

  return (
      <aside className={panelClassName}>
        <div className="mb-4 px-2">
          <p className={sectionTitleClassName}>
            Чаты
          </p>
          <h2 className={sectionHeadingClassName}>
            Последняя активность
          </h2>
        </div>

        {pinnedSelectedChat ? (
            <div className="mb-4">
              <p className={pinnedLabelClassName}>
                Чат по ссылке
              </p>
              <ChatListItem
                  chat={pinnedSelectedChat}
                  isActive
                  selectedBotKey={selectedBotKey}
              />
              <div className={pinnedDividerClassName} />
            </div>
        ) : null}

        {chats.length === 0 ? (
            <div className={emptyStateClassName}>
              Для выбранного бота пока нет чатов.
            </div>
        ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                {chats.map((chat) => (
                    <ChatListItem
                        key={chat.id}
                        chat={chat}
                        isActive={selectedChatId === chat.id}
                        selectedBotKey={selectedBotKey}
                    />
                ))}
              </div>

              <div className="space-y-3 px-1">
                {loadMoreError ? (
                    <div className={listErrorClassName}>
                      {loadMoreError}
                    </div>
                ) : null}

                {pageInfo.hasMore ? (
                    <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        className="w-full"
                        isLoading={isLoadingNextPage}
                        disabled={isLoadingNextPage || !pageInfo.nextCursor}
                        onClick={handleLoadMore}
                    >
                      {isLoadingNextPage ? "Загрузка..." : "Загрузить ещё"}
                    </Button>
                ) : null}

                {showEndOfList ? (
                    <div className={listStateClassName}>
                      Вы дошли до конца списка.
                    </div>
                ) : null}
              </div>
            </div>
        )}
      </aside>
  );
}
