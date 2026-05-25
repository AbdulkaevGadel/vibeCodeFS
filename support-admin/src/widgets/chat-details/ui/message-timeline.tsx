import { RefObject } from "react";
import type { ChatMessage } from "@/entities/chat-message";
import type { Manager } from "@/entities/manager";
import { MessageBubble } from "./message-bubble";

const messagesPanelClassName =
  "mt-5 flex max-h-[400px] min-h-[300px] flex-col gap-4 overflow-y-auto rounded-2xl border border-dashed border-slate-200 bg-slate-50/30 p-4 shadow-inner";
const emptyMessagesClassName = "py-10 text-center text-slate-400";

type MessageTimelineProps = {
  allManagers: Manager[];
  chatTitle: string;
  isAdmin: boolean;
  isPending: boolean;
  messages: ChatMessage[];
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onDeleteMessage: (messageId: string) => void;
};

export function MessageTimeline({
  allManagers,
  chatTitle,
  isAdmin,
  isPending,
  messages,
  messagesEndRef,
  onDeleteMessage,
}: MessageTimelineProps) {
  return (
    <div className={messagesPanelClassName}>
      {messages.length === 0 ? <div className={emptyMessagesClassName}>Сообщений пока нет</div> : null}

      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          allManagers={allManagers}
          chatTitle={chatTitle}
          isAdmin={isAdmin}
          isPending={isPending}
          message={message}
          onDeleteMessage={onDeleteMessage}
        />
      ))}

      <div ref={messagesEndRef} />
    </div>
  );
}
