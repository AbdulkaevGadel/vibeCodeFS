"use client";

import { useState, useTransition } from "react";
import { sendManagerMessageAction } from "../(protected)/_actions/chat-actions";
import { Button } from "@/shared/ui/button";
import { Toast, useToastState } from "@/shared/ui/toast";

type ChatMessageInputProps = {
  chatId: string;
  onLocalMessage?: (msg: any) => void;
};

const wrapperClassName = "mt-6 border-t border-slate-200 pt-6";
const composerClassName = "support-card relative overflow-hidden focus-within:ring-2 focus-within:ring-slate-950/10";
const textareaClassName =
  "w-full resize-none bg-transparent p-4 text-sm text-slate-700 placeholder-slate-400 outline-none";
const toolbarClassName = "flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3";
const toolbarTextClassName = "support-text-muted text-[11px] uppercase tracking-wider";

export function ChatMessageInput({ chatId,onLocalMessage }: ChatMessageInputProps) {
  const [text, setText] = useState("");
  const { toast, showToast, closeToast } = useToastState<"error">();
  const [isPending, startTransition] = useTransition();

  const handleSend = () => {
    if (!text.trim() || isPending) return;

    const clientMessageId = crypto.randomUUID();


    onLocalMessage?.({
      id: "temp-" + clientMessageId,
      chatId,
      senderType: "manager",
      managerId: null,
      text,
      deliveryStatus: "pending",
      deliveryError: null,
      clientMessageId,
      legacyMessageId: null,
      createdAt: new Date().toISOString(),
    });

    setText("");

    startTransition(async () => {
      const result = await sendManagerMessageAction(chatId, text, clientMessageId);

      if (!result.success) {
        showToast(result.error ? `Ошибка при отправке: ${result.error}` : "Сообщение не отправлено.", "error");
      }
    });
  };



  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSend();
    }
  };

  return (
    <div className={wrapperClassName}>
      <div className={composerClassName}>
        <textarea
          rows={3}
          className={textareaClassName}
          placeholder="Напишите ответ клиенту... (Cmd + Enter для отправки)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isPending}
        />
        <div className={toolbarClassName}>
          <p className={toolbarTextClassName}>
            Ответ будет отправлен в Telegram
          </p>
          <Button
            onClick={handleSend}
            disabled={!text.trim()}
            isLoading={isPending}
            variant="primary"
            size="sm"
          >
            Отправить
          </Button>
        </div>
      </div>
      {toast ? (
        <Toast
          key={toast.id}
          message={toast.message}
          variant={toast.variant}
          onClose={() => closeToast(toast.id)}
        />
      ) : null}
    </div>
  );
}
