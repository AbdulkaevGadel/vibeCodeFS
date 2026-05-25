import type { SupportChatStatus } from "@/entities/support-chat";

export type ChatActionResult =
  | {
      success: true;
    }
  | {
      success: false;
      error?: string;
    };

export type ChatDetailsActions = {
  deleteChat: (chatId: string) => Promise<ChatActionResult>;
  deleteMessage: (messageId: string) => Promise<ChatActionResult>;
  markChatAsRead: (chatId: string) => Promise<ChatActionResult>;
  sendManagerMessage: (
    chatId: string,
    text: string,
    clientMessageId: string,
  ) => Promise<ChatActionResult>;
  takeChatIntoWork: (chatId: string) => Promise<ChatActionResult>;
  transferChat: (
    chatId: string,
    targetManagerId: string,
    expectedFromManagerId?: string | null,
  ) => Promise<ChatActionResult>;
  updateChatStatus: (
    chatId: string,
    newStatus: SupportChatStatus,
    expectedStatus?: string | null,
  ) => Promise<ChatActionResult>;
};
