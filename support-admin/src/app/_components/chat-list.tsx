"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatSummary } from "../_lib/page-types";
import { getBotKey } from "../_lib/page-utils";
import { createSupabaseClient } from "@/lib/supabase";
import { ChatListItem } from "./chat-list-item";

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
  last_read_at: string | null;
  created_at: string;
  updated_at: string;
};

type RealtimeMessageRow = {
  id: string;
  chat_id: string;
  sender_type: "client" | "manager";
  text: string;
  created_at: string;
};

function compareNullableDatesDesc(left: string | null, right: string | null) {
  if (left && right) return new Date(right).getTime() - new Date(left).getTime();
  if (left && !right) return -1;
  if (!left && right) return 1;
  return 0;
}

function sortChatsByActivity(chats: ChatSummary[]) {
  return [...chats].sort((left, right) => {
    const lastMessageCompare = compareNullableDatesDesc(left.lastMessageAt, right.lastMessageAt);
    if (lastMessageCompare !== 0) return lastMessageCompare;

    const createdAtCompare =
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    if (createdAtCompare !== 0) return createdAtCompare;

    return left.id.localeCompare(right.id);
  });
}

function isMatchingBot(
    row: Pick<RealtimeChatRow, "bot_username">,
    selectedBotKey: string | null,
) {
  if (!selectedBotKey) return true;
  return getBotKey(row.bot_username) === selectedBotKey;
}

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

  // ✅ стабильный supabase client
  const supabaseRef = useRef<ReturnType<typeof createSupabaseClient> | null>(null);
  if (!supabaseRef.current) {
    supabaseRef.current = createSupabaseClient();
  }

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

  // ✅ realtime подписка (один раз!)
  useEffect(() => {
    const supabase = supabaseRef.current!;

    const channel = supabase
        .channel("support:chat-list:patching") 
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
                  if (isMatchingBot(inserted, selectedBotKeyRef.current)) {
                    router.refresh(); // Recovery through SSR
                  }
                  break;
                }

                case "UPDATE": {
                  const updated = payload.new as RealtimeChatRow;
                  const old = payload.old as Partial<RealtimeChatRow>;

                  if (!isMatchingBot(updated, selectedBotKeyRef.current)) {
                    const next = chatsRef.current.filter((c) => c.id !== updated.id);
                    chatsRef.current = next;
                    setChats(next);
                    return;
                  }

                  const exists = chatsRef.current.find((c) => c.id === updated.id);
                  if (!exists) {
                    router.refresh();
                    return;
                  }

                  const next = sortChatsByActivity(
                      chatsRef.current.map((c) => {
                        if (c.id !== updated.id) return c;
                        
                        return {
                          ...c,
                          status: updated.status,
                          lastMessageAt: updated.last_message_at || c.lastMessageAt,
                          lastReadAt: updated.last_read_at,
                          // Important: Do NOT reset unreadCount to 0 here based on partial payloads.
                          // Realtime updates often lack 'old' data, making diffing unreliable.
                          // unreadCount is managed by ChatDetailsClient (marking as read)
                          // and ChatList's own message-insert handler.
                          unreadCount: c.unreadCount, 
                          updatedAt: updated.updated_at,
                        };
                      })
                  );

                  chatsRef.current = next;
                  setChats(next);
                  break;
                }

                case "DELETE": {
                  const deleted = payload.old as { id: string };
                  const next = chatsRef.current.filter((c) => c.id !== deleted.id);
                  chatsRef.current = next;
                  setChats(next);

                  if (deleted.id === selectedChatIdRef.current) {
                    router.refresh();
                  }
                  break;
                }
              }
            },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "chat_messages",
          },
          (payload) => {
            const inserted = payload.new as RealtimeMessageRow;
            const currentChat = chatsRef.current.find(c => c.id === inserted.chat_id);
            
            if (!currentChat) {
              // If we receive a message for a chat we don't have in state, 
              // it might be a new chat or a sync issue. Trigger refresh.
              router.refresh();
              return;
            }

            // Hybrid Patch: update preview and unreadCount locally
            const next = sortChatsByActivity(
              chatsRef.current.map(c => {
                if (c.id !== inserted.chat_id) return c;

                const isNewClientMessage = inserted.sender_type === 'client';
                const shouldIncrementUnread = isNewClientMessage && c.id !== selectedChatIdRef.current;

                return {
                  ...c,
                  subtitle: inserted.text.length > 50 ? inserted.text.substring(0, 50) + '...' : inserted.text,
                  unreadCount: shouldIncrementUnread ? c.unreadCount + 1 : c.unreadCount,
                  lastMessageAt: inserted.created_at,
                };
              })
            );

            chatsRef.current = next;
            setChats(next);
          }
        )
        .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
      <aside className="support-panel p-4">
        <div className="mb-4 px-2">
          <p className="support-text-muted text-xs uppercase tracking-[0.3em]">
            Чаты
          </p>
          <h2 className="support-text-primary mt-2 text-xl font-semibold">
            Последняя активность
          </h2>
        </div>

        {chats.length === 0 ? (
            <div className="support-text-secondary support-surface-muted rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm">
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