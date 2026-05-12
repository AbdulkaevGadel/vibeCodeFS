"use client";

import { useEffect, useRef } from "react";
import { createSupabaseClient } from "@/lib/supabase";
import { ChatMessage, MessageSenderType } from "../../_lib/page-types";

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

type RealtimeMessageDeliveryUpdateRow = Pick<
  RealtimeMessageRow,
  "id" | "chat_id" | "delivery_status" | "delivery_error" | "client_message_id"
>;

type UseChatDetailsRealtimeOptions = {
  chatId: string;
  onInsertMessage: (message: ChatMessage) => void;
  onUpdateDeliveryState: (row: RealtimeMessageDeliveryUpdateRow) => void;
  refreshDetails: () => void;
};

export function sortMessagesByCreatedAt(messages: ChatMessage[]) {
  return [...messages].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

export function dedupeMessagesById(messages: ChatMessage[]) {
  return Array.from(new Map(messages.map((message) => [message.id, message])).values());
}

export function normalizeMessages(messages: ChatMessage[]) {
  return sortMessagesByCreatedAt(dedupeMessagesById(messages));
}

export function formatRealtimeMessage(row: RealtimeMessageRow): ChatMessage {
  return {
    id: row.id,
    chatId: row.chat_id,
    senderType: row.sender_type,
    managerId: row.manager_id,
    text: row.text,
    deliveryStatus: row.delivery_status,
    deliveryError: row.delivery_error,
    clientMessageId: row.client_message_id,
    legacyMessageId: row.legacy_message_id,
    createdAt: row.created_at,
  };
}

export function mergeInsertedMessage(messages: ChatMessage[], inserted: ChatMessage) {
  if (messages.some((message) => message.id === inserted.id)) {
    return messages;
  }

  const withoutOptimisticDuplicate = inserted.clientMessageId
    ? messages.filter((message) => message.clientMessageId !== inserted.clientMessageId)
    : messages;

  return normalizeMessages([...withoutOptimisticDuplicate, inserted]);
}

export function mergeUpdatedDeliveryState(
  messages: ChatMessage[],
  updated: RealtimeMessageDeliveryUpdateRow,
) {
  return normalizeMessages(
    messages.map((message) =>
      message.id === updated.id || message.clientMessageId === updated.client_message_id
        ? {
            ...message,
            id: updated.id,
            deliveryStatus: updated.delivery_status,
            deliveryError: updated.delivery_error,
          }
        : message,
    ),
  );
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
            const updatedRow = payload.new as RealtimeMessageDeliveryUpdateRow;
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
