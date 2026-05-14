"use client";

import { useEffect, useRef } from "react";
import { ChatMessage } from "../../_lib/page-types";
import { markChatAsReadAction } from "../../(protected)/_actions/chat-actions";
import { normalizeMessages } from "./chat-details-realtime";

type UseSelectedChatReadStateOptions = {
  chatId: string;
  unreadCount: number;
  initialMessages: ChatMessage[];
  syncMessages: (messages: ChatMessage[]) => void;
  closeTransferMenu: () => void;
};

export function useSelectedChatReadState({
  chatId,
  unreadCount,
  initialMessages,
  syncMessages,
  closeTransferMenu,
}: UseSelectedChatReadStateOptions) {
  const lastMarkedReadRef = useRef<string | null>(null);

  useEffect(() => {
    syncMessages(normalizeMessages(initialMessages));
    closeTransferMenu();

    if (chatId && unreadCount > 0 && lastMarkedReadRef.current !== chatId) {
      lastMarkedReadRef.current = chatId;
      markChatAsReadAction(chatId).catch((error) => {
        console.warn("Failed to mark chat as read:", error);
      });
    }
  }, [chatId, closeTransferMenu, initialMessages, syncMessages, unreadCount]);
}
