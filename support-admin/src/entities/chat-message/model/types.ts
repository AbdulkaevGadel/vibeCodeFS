export type MessageSenderType = "client" | "manager" | "ai" | "system";

export type MessageDeliveryStatus = "pending" | "sent" | "failed";

export type ChatMessage = {
  id: string;
  chatId: string;
  senderType: MessageSenderType;
  managerId: string | null;
  text: string;
  deliveryStatus: MessageDeliveryStatus | null;
  deliveryError: string | null;
  clientMessageId: string | null;
  legacyMessageId: number | null;
  createdAt: string;
};

export type ChatMessageRow = {
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

export type MessageDeliveryUpdateRow = Pick<
  ChatMessageRow,
  "id" | "chat_id" | "delivery_status" | "delivery_error" | "client_message_id"
>;
