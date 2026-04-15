import { ChatMessage, ChatSummary, Manager } from "../_lib/page-types";
import { ChatDetailsClient } from "./chat-details-client";

const detailsSectionClassName = "support-panel p-5";
const emptyStateClassName =
  "support-text-secondary support-surface-muted flex min-h-[440px] items-center justify-center rounded-[var(--support-radius-card)] border border-dashed border-slate-300 px-6 text-center text-sm";

type ChatDetailsProps = {
  selectedChat: ChatSummary | null;
  selectedChatMessages: ChatMessage[];
  selectedBotKey: string | null;
  allManagers: Manager[];
  currentManager: Manager | null;
};

export function ChatDetails({
  selectedChat,
  selectedChatMessages,
  selectedBotKey,
  allManagers,
  currentManager,
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
        />
      ) : (
        <div className={emptyStateClassName}>
          Выбери чат слева, чтобы посмотреть сообщения и действия по нему.
        </div>
      )}
    </section>
  );
}
