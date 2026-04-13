"use client";

import { useTransition } from "react";
import { ChatMessage, ChatSummary } from "../_lib/page-types";
import { takeChatIntoWorkAction } from "../(protected)/_actions/chat-actions";

const detailsHeaderClassName =
  "flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between";
const detailsEyebrowClassName = "support-text-muted text-xs uppercase tracking-[0.3em]";
const detailsTitleClassName = "support-text-primary mt-2 text-2xl font-semibold";
const detailsFullNameClassName = "support-text-secondary mt-2 text-sm";
const detailsMetaListClassName = "support-text-secondary mt-3 flex flex-wrap gap-2 text-xs";
const detailsMetaItemClassName = "support-chip rounded-full px-3 py-1";
const messagesWrapperClassName = "mt-5 space-y-4";
const messageCardClassName = "support-card p-4";
const messageHeaderClassName =
  "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between";
const messageAuthorClassName = "flex items-center gap-3";
const messageIndexClassName =
  "flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white";
const messageAuthorNameClassName = "support-text-primary text-sm font-semibold";
const messageDateClassName = "support-text-muted mt-1 text-xs";
const messageBadgeClassName =
  "support-chip rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em]";
const messageTextClassName = "support-text-secondary mt-4 whitespace-pre-wrap text-[15px] leading-7";
const primaryButtonClassName = "rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2";

type ChatDetailsClientProps = {
  selectedChat: ChatSummary;
  initialMessages: ChatMessage[];
  selectedBotKey: string | null;
};

function getSenderLabel(message: ChatMessage, chatTitle: string) {
  if (message.senderType === "manager") {
    return "Менеджер";
  }

  return chatTitle;
}

export function ChatDetailsClient({ selectedChat, initialMessages }: ChatDetailsClientProps) {
  const [isPending, startTransition] = useTransition();
  const visibleMessages = initialMessages;

  const handleTakeIntoWork = () => {
    startTransition(async () => {
      const result = await takeChatIntoWorkAction(selectedChat.id);
      if (!result.success) {
        alert("Ошибка: " + result.error);
      }
    });
  };

  return (
    <>
      <div className={detailsHeaderClassName}>
        <div>
          <p className={detailsEyebrowClassName}>Диалог</p>
          <h2 className={detailsTitleClassName}>{selectedChat.title}</h2>
          {selectedChat.fullName ? (
            <p className={detailsFullNameClassName}>{selectedChat.fullName}</p>
          ) : null}
          <div className={detailsMetaListClassName}>
            <span className="support-chip flex items-center gap-1.5 rounded-full px-3 py-1 ring-1 ring-slate-200">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
              chat_id: {selectedChat.telegramChatId}
            </span>
            <span className="support-chip flex items-center gap-1.5 rounded-full px-3 py-1 ring-1 ring-slate-200">
              <span className={`h-1.5 w-1.5 rounded-full ${selectedChat.status === "open" ? "bg-emerald-500" : "bg-blue-500"}`}></span>
              status: {selectedChat.status}
            </span>
            <span className="support-chip flex items-center gap-1.5 rounded-full px-3 py-1 ring-1 ring-slate-200">
              client_id: {selectedChat.telegramUserId}
            </span>
            <span className="support-chip flex items-center gap-1.5 rounded-full px-3 py-1 ring-1 ring-slate-200">
              сообщений: {visibleMessages.length}
            </span>
            {selectedChat.assignedManagerName && (
              <span className="support-chip flex items-center gap-1.5 rounded-full px-3 py-1 ring-1 ring-slate-200">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                ответственный: {selectedChat.assignedManagerName}
              </span>
            )}
          </div>
        </div>

        {selectedChat.status === "open" && (
          <button
            onClick={handleTakeIntoWork}
            disabled={isPending}
            className={primaryButtonClassName}
          >
            {isPending ? "Обработка..." : "Взять в работу"}
          </button>
        )}
      </div>

      <div className={messagesWrapperClassName}>
        {visibleMessages.map((message, index) => (
          <article key={message.id} className={messageCardClassName}>
            <div className={messageHeaderClassName}>
              <div className={messageAuthorClassName}>
                <span className={messageIndexClassName}>{index + 1}</span>
                <div>
                  <p className={messageAuthorNameClassName}>{getSenderLabel(message, selectedChat.title)}</p>
                  <p className={messageDateClassName}>
                    {new Date(message.createdAt).toLocaleString("ru-RU")}
                  </p>
                </div>
              </div>

              <span className={messageBadgeClassName}>
                {message.legacyMessageId ? `legacy #${message.legacyMessageId}` : "live"}
              </span>
            </div>

            <p className={messageTextClassName}>{message.text || "Пустое сообщение"}</p>
          </article>
        ))}
      </div>
    </>
  );
}
