"use client";

import { Dispatch, MutableRefObject, SetStateAction, useEffect, useState } from "react";
import { createSupabaseClient } from "@/shared/api/supabase/browser-client";
import { getBotKey, sortSupportChatsByActivity, type SupportChatStatus, type SupportChatSummary } from "@/entities/support-chat";
import type { MessageSenderType } from "@/entities/chat-message";

type RealtimeChatRow = {
  id: string;
  bot_username: string | null;
  status: SupportChatStatus;
  last_message_at: string | null;
  last_read_at: string | null;
  created_at: string;
  updated_at: string;
};

type RealtimeMessageRow = {
  id: string;
  chat_id: string;
  sender_type: MessageSenderType;
  text: string;
  created_at: string;
};

type UseChatListRealtimeOptions = {
  chatsRef: MutableRefObject<SupportChatSummary[]>;
  selectedChatIdRef: MutableRefObject<string | null>;
  selectedBotKeyRef: MutableRefObject<string | null>;
  setChats: Dispatch<SetStateAction<SupportChatSummary[]>>;
  refreshList: () => void;
};

function isMatchingBot(row: Pick<RealtimeChatRow, "bot_username">, selectedBotKey: string | null) {
  if (!selectedBotKey) return true;
  return getBotKey(row.bot_username) === selectedBotKey;
}

function patchUpdatedChat(chats: SupportChatSummary[], updated: RealtimeChatRow) {
  return sortSupportChatsByActivity(
    chats.map((chat) =>
      chat.id === updated.id
        ? {
            ...chat,
            status: updated.status,
            lastMessageAt: updated.last_message_at || chat.lastMessageAt,
            lastReadAt: updated.last_read_at,
            unreadCount: chat.unreadCount,
            updatedAt: updated.updated_at,
          }
        : chat,
    ),
  );
}

function removeDeletedChat(chats: SupportChatSummary[], deletedId: string) {
  return chats.filter((chat) => chat.id !== deletedId);
}

function patchInsertedMessage(
  chats: SupportChatSummary[],
  inserted: RealtimeMessageRow,
  selectedChatId: string | null,
) {
  return sortSupportChatsByActivity(
    chats.map((chat) => {
      if (chat.id !== inserted.chat_id) return chat;

      const isNewClientMessage = inserted.sender_type === "client";
      const shouldIncrementUnread = isNewClientMessage && chat.id !== selectedChatId;

      return {
        ...chat,
        subtitle: inserted.text.length > 50 ? `${inserted.text.substring(0, 50)}...` : inserted.text,
        unreadCount: shouldIncrementUnread ? chat.unreadCount + 1 : chat.unreadCount,
        lastMessageAt: inserted.created_at,
      };
    }),
  );
}

export function useChatListRealtime({
  chatsRef,
  selectedChatIdRef,
  selectedBotKeyRef,
  setChats,
  refreshList,
}: UseChatListRealtimeOptions) {
  const [supabase] = useState(() => createSupabaseClient());

  useEffect(() => {
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
                refreshList();
              }
              break;
            }

            case "UPDATE": {
              const updated = payload.new as RealtimeChatRow;

              if (!isMatchingBot(updated, selectedBotKeyRef.current)) {
                const next = removeDeletedChat(chatsRef.current, updated.id);
                chatsRef.current = next;
                setChats(next);
                return;
              }

              const exists = chatsRef.current.some((chat) => chat.id === updated.id);
              if (!exists) {
                refreshList();
                return;
              }

              const next = patchUpdatedChat(chatsRef.current, updated);
              chatsRef.current = next;
              setChats(next);
              break;
            }

            case "DELETE": {
              const deleted = payload.old as { id: string };
              const next = removeDeletedChat(chatsRef.current, deleted.id);
              chatsRef.current = next;
              setChats(next);

              if (deleted.id === selectedChatIdRef.current) {
                refreshList();
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
          const hasChat = chatsRef.current.some((chat) => chat.id === inserted.chat_id);

          if (!hasChat) {
            refreshList();
            return;
          }

          const next = patchInsertedMessage(chatsRef.current, inserted, selectedChatIdRef.current);
          chatsRef.current = next;
          setChats(next);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatsRef, refreshList, selectedBotKeyRef, selectedChatIdRef, setChats, supabase]);
}
