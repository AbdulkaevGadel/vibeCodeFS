import { ChatSummary, Message } from "../_lib/page-types";
import { ChatDetailsClient } from "./chat-details-client";

const detailsSectionClassName = "support-panel p-5";
const emptyStateClassName =
  "support-text-secondary support-surface-muted flex min-h-[440px] items-center justify-center rounded-[var(--support-radius-card)] border border-dashed border-slate-300 px-6 text-center text-sm";

type ChatDetailsProps = {
  selectedChat: ChatSummary | null;
  selectedChatMessages: Message[];
  selectedBotKey: string | null;
};

export function ChatDetails({
  selectedChat,
  selectedChatMessages,
  selectedBotKey,
}: ChatDetailsProps) {
  return (
    <section className={detailsSectionClassName}>
      {selectedChat ? (
        <ChatDetailsClient
          selectedChat={selectedChat}
          initialMessages={selectedChatMessages}
          selectedBotKey={selectedBotKey}
        />
      ) : (
        <div className={emptyStateClassName}>
          Выбери чат слева, чтобы посмотреть сообщения и действия по нему.
        </div>
      )}
    </section>
  );
}
