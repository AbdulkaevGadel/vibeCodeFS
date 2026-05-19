import type { ChatMessage, ChatMessageRow, MessageDeliveryUpdateRow } from "../model";

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

export function mapChatMessage(row: ChatMessageRow): ChatMessage {
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

export function mergeUpdatedDeliveryState(messages: ChatMessage[], updated: MessageDeliveryUpdateRow) {
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
