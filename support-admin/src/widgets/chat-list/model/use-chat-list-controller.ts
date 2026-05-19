"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  sortSupportChatsByActivity,
  type SupportChatInboxPage,
  type SupportChatInboxPageInfo,
  type SupportChatSummary,
} from "@/entities/support-chat";
import {
  mergeChatPages,
  readCachedChatListState,
  writeCachedChatListState,
} from "../lib/chat-list-cache";

export type LoadChatInboxPage = (input: {
  botUsername: string | null;
  cursor: NonNullable<SupportChatInboxPageInfo["nextCursor"]>;
}) => Promise<
  | {
      success: true;
      data: SupportChatInboxPage;
    }
  | {
      success: false;
      error: string;
    }
>;

type UseChatListControllerOptions = {
  chatSummaries: SupportChatSummary[];
  chatInboxPageInfo: SupportChatInboxPageInfo;
  selectedChatId: string | null;
  selectedBotKey: string | null;
  selectedBotUsername: string | null;
  loadChatInboxPage: LoadChatInboxPage;
};

export function useChatListController({
  chatSummaries,
  chatInboxPageInfo,
  selectedChatId,
  selectedBotKey,
  selectedBotUsername,
  loadChatInboxPage,
}: UseChatListControllerOptions) {
  const [chats, setChats] = useState(() => sortSupportChatsByActivity(chatSummaries));
  const [pageInfo, setPageInfo] = useState(chatInboxPageInfo);
  const [isLoadingNextPage, setIsLoadingNextPage] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const chatsRef = useRef(chats);
  const pageInfoRef = useRef(pageInfo);
  const hasLoadedAdditionalPagesRef = useRef(false);
  const selectedBotUsernameRef = useRef(selectedBotUsername);
  const selectedChatIdRef = useRef(selectedChatId);
  const selectedBotKeyRef = useRef(selectedBotKey);

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

  useEffect(() => {
    const sorted = sortSupportChatsByActivity(chatSummaries);
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

  useEffect(() => {
    if (!selectedChatId) return;

    const next = chatsRef.current.map((chat) =>
      chat.id === selectedChatId ? { ...chat, unreadCount: 0 } : chat,
    );

    chatsRef.current = next;
    setChats(next);
    writeCachedChatListState(selectedBotUsername, {
      chats: next,
      pageInfo: pageInfoRef.current,
      hasLoadedAdditionalPages: hasLoadedAdditionalPagesRef.current,
    });
  }, [selectedChatId, selectedBotUsername]);

  const handleLoadMore = useCallback(async () => {
    if (isLoadingNextPage || !pageInfo.hasMore || !pageInfo.nextCursor) return;

    setIsLoadingNextPage(true);
    setLoadMoreError(null);

    const result = await loadChatInboxPage({
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
  }, [isLoadingNextPage, loadChatInboxPage, pageInfo, selectedBotUsername]);

  return {
    chats,
    pageInfo,
    isLoadingNextPage,
    loadMoreError,
    chatsRef,
    selectedChatIdRef,
    selectedBotKeyRef,
    setChats,
    handleLoadMore,
  };
}
