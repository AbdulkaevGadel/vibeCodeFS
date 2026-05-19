"use client";

import { useEffect, useRef } from "react";
import { normalizeMessages, type ChatMessage } from "@/entities/chat-message";

type UseSelectedChatReadStateOptions = {
  chatId: string;
  unreadCount: number;
  initialMessages: ChatMessage[];
  syncMessages: (messages: ChatMessage[]) => void;
  closeTransferMenu: () => void;
  markChatAsRead: (chatId: string) => Promise<unknown>;
};

export function useSelectedChatReadState({
  chatId,
  unreadCount,
  initialMessages,
  syncMessages,
  closeTransferMenu,
  markChatAsRead,
}: UseSelectedChatReadStateOptions) {
  const lastMarkedReadRef = useRef<string | null>(null);

  useEffect(() => {
    syncMessages(normalizeMessages(initialMessages));
    closeTransferMenu();

    if (chatId && unreadCount > 0 && lastMarkedReadRef.current !== chatId) {
      lastMarkedReadRef.current = chatId;
      markChatAsRead(chatId).catch((error) => {
        console.warn("Failed to mark chat as read:", error);
      });
    }
  }, [chatId, closeTransferMenu, initialMessages, markChatAsRead, syncMessages, unreadCount]);
}
