"use client";

import { ChatMessage, ChatSummary } from "../_lib/page-types";

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

type ChatDetailsClientProps = {
  selectedChat: ChatSummary;
  initialMessages: ChatMessage[];
  selectedBotKey: string | null;
};

function getSenderLabel(message: ChatMessage) {
  if (message.senderType === "manager") {
    return "Менеджер";
  }

  return "Клиент";
}

export function ChatDetailsClient({ selectedChat, initialMessages }: ChatDetailsClientProps) {
  const visibleMessages = initialMessages;

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
            <span className={detailsMetaItemClassName}>
              chat_id: {selectedChat.telegramChatId}
            </span>
            <span className={detailsMetaItemClassName}>status: {selectedChat.status}</span>
            <span className={detailsMetaItemClassName}>
              client_id: {selectedChat.telegramUserId}
            </span>
            <span className={detailsMetaItemClassName}>сообщений: {visibleMessages.length}</span>
          </div>
        </div>
      </div>

      <div className={messagesWrapperClassName}>
        {visibleMessages.map((message, index) => (
          <article key={message.id} className={messageCardClassName}>
            <div className={messageHeaderClassName}>
              <div className={messageAuthorClassName}>
                <span className={messageIndexClassName}>{index + 1}</span>
                <div>
                  <p className={messageAuthorNameClassName}>{getSenderLabel(message)}</p>
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
