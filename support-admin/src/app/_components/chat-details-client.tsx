"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmSubmitButton } from "../confirm-submit-button";
import { ChatSummary, Message } from "../_lib/page-types";
import { getPersonName } from "../_lib/page-utils";
import { OverlayToast } from "./overlay-toast";

const detailsHeaderClassName =
  "flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between";
const detailsEyebrowClassName = "support-text-muted text-xs uppercase tracking-[0.3em]";
const detailsTitleClassName = "support-text-primary mt-2 text-2xl font-semibold";
const detailsFullNameClassName = "support-text-secondary mt-2 text-sm";
const detailsMetaListClassName = "support-text-secondary mt-3 flex flex-wrap gap-2 text-xs";
const detailsMetaItemClassName = "support-chip rounded-full px-3 py-1";
const deleteChatButtonClassName =
  "support-button-danger rounded-full px-4 py-2 text-sm font-medium transition";
const messagesWrapperClassName = "mt-5 space-y-4";
const messageCardClassName = "support-card p-4";
const messageHeaderClassName =
  "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between";
const messageAuthorClassName = "flex items-center gap-3";
const messageIndexClassName =
  "flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white";
const messageAuthorNameClassName = "support-text-primary text-sm font-semibold";
const messageDateClassName = "support-text-muted mt-1 text-xs";
const deleteButtonClassName =
  "support-button-secondary rounded-full px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60";
const messageTextClassName = "support-text-secondary mt-4 whitespace-pre-wrap text-[15px] leading-7";

type ToastState = {
  message: string;
  variant: "success" | "error";
} | null;

type ChatDetailsClientProps = {
  selectedChat: ChatSummary;
  initialMessages: Message[];
  selectedBotKey: string | null;
};

export function ChatDetailsClient({
  selectedChat,
  initialMessages,
  selectedBotKey,
}: ChatDetailsClientProps) {
  const router = useRouter();
  const [isDeletingMessageId, setIsDeletingMessageId] = useState<number | null>(null);
  const [optimisticallyRemovedIds, setOptimisticallyRemovedIds] = useState<number[]>([]);
  const [isDeletingChat, setIsDeletingChat] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    setOptimisticallyRemovedIds([]);
  }, [initialMessages]);

  const visibleMessages = initialMessages.filter(
    (message) => !optimisticallyRemovedIds.includes(message.id),
  );

  async function handleDeleteMessage(messageId: number) {
    if (!window.confirm("Удалить это сообщение?")) {
      return;
    }

    const formData = new FormData();
    formData.set("messageId", String(messageId));
    formData.set("bot", selectedBotKey ?? "");
    formData.set("chat", String(selectedChat.chatId));

    setIsDeletingMessageId(messageId);

    try {
      const response = await fetch("/api/messages/delete", {
        method: "POST",
        body: formData,
        headers: {
          "x-requested-with": "fetch",
        },
      });

      const result = (await response.json()) as { ok?: boolean; message?: string };

      if (!response.ok || !result.ok) {
        setToast({
          message: result.message || "Удаление не выполнено. Проверь серверные env-переменные Supabase.",
          variant: "error",
        });
        return;
      }

      setOptimisticallyRemovedIds((currentIds) => [...currentIds, messageId]);
      setToast({
        message: result.message || "Сообщение удалено.",
        variant: "success",
      });
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      console.error(error);
      setToast({
        message: "Удаление не выполнено. Проверь серверные env-переменные Supabase.",
        variant: "error",
      });
    } finally {
      setIsDeletingMessageId(null);
    }
  }

  async function handleDeleteChat() {
    if (!window.confirm("Удалить весь чат и все его сообщения у выбранного бота?")) {
      return;
    }

    const formData = new FormData();
    formData.set("chatId", String(selectedChat.chatId));
    formData.set("bot", selectedBotKey ?? "");

    setIsDeletingChat(true);

    try {
      await fetch("/api/chats/delete", {
        method: "POST",
        body: formData,
      });

      router.refresh();
    } finally {
      setIsDeletingChat(false);
    }
  }

  return (
    <>
      {toast ? (
        <OverlayToast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      ) : null}

      <div className={detailsHeaderClassName}>
        <div>
          <p className={detailsEyebrowClassName}>Диалог</p>
          <h2 className={detailsTitleClassName}>{selectedChat.title}</h2>
          {selectedChat.fullName ? (
            <p className={detailsFullNameClassName}>{selectedChat.fullName}</p>
          ) : null}
          <div className={detailsMetaListClassName}>
            <span className={detailsMetaItemClassName}>chat_id: {selectedChat.chatId}</span>
            <span className={detailsMetaItemClassName}>сообщений: {visibleMessages.length}</span>
          </div>
        </div>

        <ConfirmSubmitButton
          message="Удалить весь чат и все его сообщения у выбранного бота?"
          className={deleteChatButtonClassName}
          onConfirm={handleDeleteChat}
          disabled={isDeletingChat}
        >
          {isDeletingChat ? "Удаляю чат..." : "Удалить чат целиком"}
        </ConfirmSubmitButton>
      </div>

      <div className={messagesWrapperClassName}>
        {visibleMessages.map((message, index) => (
          <article key={message.id} className={messageCardClassName}>
            <div className={messageHeaderClassName}>
              <div className={messageAuthorClassName}>
                <span className={messageIndexClassName}>{index + 1}</span>
                <div>
                  <p className={messageAuthorNameClassName}>{getPersonName(message)}</p>
                  <p className={messageDateClassName}>
                    {new Date(message.created_at).toLocaleString("ru-RU")}
                  </p>
                </div>
              </div>

              <ConfirmSubmitButton
                message="Удалить это сообщение?"
                className={deleteButtonClassName}
                onConfirm={() => handleDeleteMessage(message.id)}
                disabled={isDeletingMessageId === message.id}
              >
                {isDeletingMessageId === message.id ? "Удаляю..." : "Удалить сообщение"}
              </ConfirmSubmitButton>
            </div>

            <p className={messageTextClassName}>{message.text || "Пустое сообщение"}</p>
          </article>
        ))}
      </div>
    </>
  );
}
