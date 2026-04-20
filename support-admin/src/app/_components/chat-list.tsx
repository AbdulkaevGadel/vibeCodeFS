"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatSummary } from "../_lib/page-types";
import { getBotKey } from "../_lib/page-utils";
import { createSupabaseClient } from "@/lib/supabase";
import { ChatListItem } from "./chat-list-item";

const chatListClassName = "support-panel p-4";
const chatListHeaderClassName = "mb-4 px-2";
const chatListEyebrowClassName = "support-text-muted text-xs uppercase tracking-[0.3em]";
const chatListTitleClassName = "support-text-primary mt-2 text-xl font-semibold";
const emptyStateClassName =
  "support-text-secondary support-surface-muted rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm";
const itemsWrapperClassName = "space-y-3";

type ChatListProps = {
  chatSummaries: ChatSummary[];
  selectedChatId: string | null;
  selectedBotKey: string | null;
};

type RealtimeChatRow = {
  id: string;
  bot_username: string | null;
  status: string;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

function compareNullableDatesDesc(left: string | null, right: string | null) {
  if (left && right) {
    return new Date(right).getTime() - new Date(left).getTime();
  }

  if (left && !right) {
    return -1;
  }

  if (!left && right) {
    return 1;
  }

  return 0;
}

function sortChatsByActivity(chats: ChatSummary[]) {
  return [...chats].sort((left, right) => {
    const lastMessageCompare = compareNullableDatesDesc(left.lastMessageAt, right.lastMessageAt);

    if (lastMessageCompare !== 0) {
      return lastMessageCompare;
    }

    const createdAtCompare = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();

    if (createdAtCompare !== 0) {
      return createdAtCompare;
    }

    return left.id.localeCompare(right.id);
  });
}

function isMatchingBot(row: Pick<RealtimeChatRow, "bot_username">, selectedBotKey: string | null) {
  if (!selectedBotKey) {
    return true;
  }

  return getBotKey(row.bot_username) === selectedBotKey;
}

function updateChatFromRealtime(chat: ChatSummary, row: RealtimeChatRow): ChatSummary {
  return {
    ...chat,
    status: row.status,
    lastMessageAt: row.last_message_at,
    updatedAt: row.updated_at,
  };
}

export function ChatList({ chatSummaries, selectedChatId, selectedBotKey }: ChatListProps) {
  const router = useRouter();
  const [chats, setChats] = useState(() => sortChatsByActivity(chatSummaries));
  const chatsRef = useRef(chats);

  useEffect(() => {
    const sortedChats = sortChatsByActivity(chatSummaries);
    chatsRef.current = sortedChats;
    setChats(sortedChats);
  }, [chatSummaries]);

  useEffect(() => {
    const supabase = createSupabaseClient();

    const channel = supabase
      .channel("chats:list")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chats",
        },
        (payload) => {
          switch (payload.eventType) {
            case "INSERT": {
              const inserted = payload.new as RealtimeChatRow;

              if (isMatchingBot(inserted, selectedBotKey)) {
                router.refresh();
              }

              break;
            }

            case "UPDATE": {
              const updated = payload.new as RealtimeChatRow;

              if (!isMatchingBot(updated, selectedBotKey)) {
                const nextChats = chatsRef.current.filter((chat) => chat.id !== updated.id);
                chatsRef.current = nextChats;
                setChats(nextChats);
                break;
              }

              const existingChat = chatsRef.current.find((chat) => chat.id === updated.id);

              if (!existingChat) {
                router.refresh();
                break;
              }

              const nextChats = sortChatsByActivity(
                chatsRef.current.map((chat) =>
                  chat.id === updated.id ? updateChatFromRealtime(chat, updated) : chat,
                ),
              );
              chatsRef.current = nextChats;
              setChats(nextChats);

              break;
            }

            case "DELETE": {
              const deleted = payload.old as Pick<RealtimeChatRow, "id" | "bot_username">;
              const nextChats = chatsRef.current.filter((chat) => chat.id !== deleted.id);

              chatsRef.current = nextChats;
              setChats(nextChats);

              if (deleted.id === selectedChatId) {
                router.refresh();
              }

              break;
            }

          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, selectedBotKey, selectedChatId]);

  return (
    <aside className={chatListClassName}>
      <div className={chatListHeaderClassName}>
        <p className={chatListEyebrowClassName}>Чаты</p>
        <h2 className={chatListTitleClassName}>Последняя активность</h2>
      </div>

      {chats.length === 0 ? (
        <div className={emptyStateClassName}>Для выбранного бота пока нет чатов.</div>
      ) : (
        <div className={itemsWrapperClassName}>
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
