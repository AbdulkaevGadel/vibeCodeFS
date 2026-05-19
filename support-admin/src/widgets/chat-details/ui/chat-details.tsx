import type { SupportChatStatus, SupportChatSummary } from "@/entities/support-chat";
import type { ChatMessage } from "@/entities/chat-message";
import { ChatDetailsClient } from "./chat-details-client";
import type { ChatDetailsManager } from "../model/manager-types";

const detailsSectionClassName = "support-panel p-5";
const emptyStateClassName =
  "support-text-secondary support-surface-muted flex min-h-[440px] items-center justify-center rounded-[var(--support-radius-card)] border border-dashed border-slate-300 px-6 text-center text-sm";

type ChatDetailsProps = {
  selectedChat: SupportChatSummary | null;
  selectedChatMessages: ChatMessage[];
  selectedBotKey: string | null;
  allManagers: ChatDetailsManager[];
  currentManager: ChatDetailsManager | null;
  actions: ChatDetailsActions;
};

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

export function ChatDetails({
  selectedChat,
  selectedChatMessages,
  selectedBotKey,
  allManagers,
  currentManager,
  actions,
}: ChatDetailsProps) {
  return (
    <section className={detailsSectionClassName}>
      {selectedChat ? (
        <ChatDetailsClient
          selectedChat={selectedChat}
          initialMessages={selectedChatMessages}
          selectedBotKey={selectedBotKey}
          allManagers={allManagers}
          currentManager={currentManager}
          actions={actions}
        />
      ) : (
        <div className={emptyStateClassName}>
          Выбери чат слева, чтобы посмотреть сообщения и действия по нему.
        </div>
      )}
    </section>
  );
}
