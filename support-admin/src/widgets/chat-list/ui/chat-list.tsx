"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/button";
import type { SupportChatInboxPageInfo, SupportChatSummary } from "@/entities/support-chat";
import { ChatListItem } from "./chat-list-item";
import { useChatListRealtime } from "../api/chat-list-realtime";
import { useChatListController, type LoadChatInboxPage } from "../model/use-chat-list-controller";

type ChatListProps = {
  chatSummaries: SupportChatSummary[];
  chatInboxPageInfo: SupportChatInboxPageInfo;
  selectedChat: SupportChatSummary | null;
  selectedChatId: string | null;
  selectedBotKey: string | null;
  selectedBotUsername: string | null;
  loadChatInboxPage: LoadChatInboxPage;
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

export function ChatList({
  chatSummaries,
  chatInboxPageInfo,
  selectedChat,
  selectedChatId,
  selectedBotKey,
  selectedBotUsername,
  loadChatInboxPage,
}: ChatListProps) {
  const router = useRouter();
  const refreshList = useCallback(() => {
    router.refresh();
  }, [router]);
  const {
    chats,
    pageInfo,
    isLoadingNextPage,
    loadMoreError,
    chatsRef,
    selectedChatIdRef,
    selectedBotKeyRef,
    setChats,
    handleLoadMore,
  } = useChatListController({
    chatSummaries,
    chatInboxPageInfo,
    selectedChatId,
    selectedBotKey,
    selectedBotUsername,
    loadChatInboxPage,
  });

  useChatListRealtime({
    chatsRef,
    selectedChatIdRef,
    selectedBotKeyRef,
    setChats,
    refreshList,
  });

  const pinnedSelectedChat =
    selectedChat && !chats.some((chat) => chat.id === selectedChat.id) ? selectedChat : null;
  const showEndOfList = chats.length > 0 && !pageInfo.hasMore;

  return (
    <aside className={panelClassName}>
      <div className="mb-4 px-2">
        <p className={sectionTitleClassName}>Чаты</p>
        <h2 className={sectionHeadingClassName}>Последняя активность</h2>
      </div>

      {pinnedSelectedChat ? (
        <div className="mb-4">
          <p className={pinnedLabelClassName}>Чат по ссылке</p>
          <ChatListItem chat={pinnedSelectedChat} isActive selectedBotKey={selectedBotKey} />
          <div className={pinnedDividerClassName} />
        </div>
      ) : null}

      {chats.length === 0 ? (
        <div className={emptyStateClassName}>Для выбранного бота пока нет чатов.</div>
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
            {loadMoreError ? <div className={listErrorClassName}>{loadMoreError}</div> : null}

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
              <div className={listStateClassName}>Вы дошли до конца списка.</div>
            ) : null}
          </div>
        </div>
      )}
    </aside>
  );
}
