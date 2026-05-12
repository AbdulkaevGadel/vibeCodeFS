"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatSummary } from "../_lib/page-types";
import { ChatListItem } from "./chat-list-item";
import { sortChatsByActivity, useChatListRealtime } from "./chat-list-realtime";

type ChatListProps = {
  chatSummaries: ChatSummary[];
  selectedChatId: string | null;
  selectedBotKey: string | null;
};

const panelClassName = "support-panel p-4";
const sectionTitleClassName = "support-text-muted text-xs uppercase tracking-[0.3em]";
const sectionHeadingClassName = "support-text-primary mt-2 text-xl font-semibold";
const emptyStateClassName =
  "support-text-secondary support-surface-muted rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm";

export function ChatList({
  chatSummaries,
  selectedChatId,
  selectedBotKey,
}: ChatListProps) {
  const router = useRouter();

  // state
  const [chats, setChats] = useState(() => sortChatsByActivity(chatSummaries));

  // refs (чтобы realtime видел актуальные значения)
  const chatsRef = useRef(chats);
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
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  useEffect(() => {
    selectedBotKeyRef.current = selectedBotKey;
  }, [selectedBotKey]);

  // sync initial data from server
  useEffect(() => {
    const sorted = sortChatsByActivity(chatSummaries);
    chatsRef.current = sorted;
    setChats(sorted);
  }, [chatSummaries]);

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
  }, [selectedChatId]);

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

        {chats.length === 0 ? (
            <div className={emptyStateClassName}>
              Для выбранного бота пока нет чатов.
            </div>
        ) : (
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
        )}
      </aside>
  );
}
