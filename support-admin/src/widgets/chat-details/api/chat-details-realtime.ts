"use client";

import { useEffect, useRef } from "react";
import { createSupabaseClient } from "@/lib/supabase";
import { mapChatMessage, type ChatMessage, type MessageDeliveryUpdateRow, type MessageSenderType } from "@/entities/chat-message";

type RealtimeMessageRow = {
  id: string;
  chat_id: string;
  sender_type: MessageSenderType;
  manager_id: string | null;
  text: string;
  delivery_status: ChatMessage["deliveryStatus"];
  delivery_error: string | null;
  client_message_id: string | null;
  legacy_message_id: number | null;
  created_at: string;
};

type UseChatDetailsRealtimeOptions = {
  chatId: string;
  onInsertMessage: (message: ChatMessage) => void;
  onUpdateDeliveryState: (row: MessageDeliveryUpdateRow) => void;
  refreshDetails: () => void;
};

export function formatRealtimeMessage(row: RealtimeMessageRow): ChatMessage {
  return mapChatMessage(row);
}

export function useChatDetailsRealtime({
  chatId,
  onInsertMessage,
  onUpdateDeliveryState,
  refreshDetails,
}: UseChatDetailsRealtimeOptions) {
  const activeChatIdRef = useRef(chatId);
  activeChatIdRef.current = chatId;

  useEffect(() => {
    const supabase = createSupabaseClient();

    const channel = supabase
      .channel(`chat_details:${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const insertedRow = payload.new as RealtimeMessageRow;
            if (insertedRow.chat_id !== activeChatIdRef.current) {
              return;
            }

            const insertedMessage = formatRealtimeMessage(insertedRow);
            onInsertMessage(insertedMessage);
            return;
          }

          if (payload.eventType === "UPDATE") {
            const updatedRow = payload.new as MessageDeliveryUpdateRow;
            if (updatedRow.chat_id !== activeChatIdRef.current) {
              return;
            }

            onUpdateDeliveryState(updatedRow);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chats",
          filter: `id=eq.${chatId}`,
        },
        refreshDetails,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, onInsertMessage, onUpdateDeliveryState, refreshDetails]);
}
