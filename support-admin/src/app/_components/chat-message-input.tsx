"use client";

import { useState, useTransition } from "react";
import { sendManagerMessageAction } from "../(protected)/_actions/chat-actions";

type ChatMessageInputProps = {
  chatId: string;
};

export function ChatMessageInput({ chatId }: ChatMessageInputProps) {
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSend = () => {
    if (!text.trim() || isPending) return;

    startTransition(async () => {
      const clientMessageId = crypto.randomUUID();
      const result = await sendManagerMessageAction(chatId, text, clientMessageId);
      if (result.success) {
        setText("");
      } else {
        alert("Ошибка при отправке: " + result.error);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSend();
    }
  };

  return (
    <div className="mt-6 border-t border-slate-200 pt-6">
      <div className="support-card relative overflow-hidden focus-within:ring-2 focus-within:ring-slate-950/10">
        <textarea
          rows={3}
          className="w-full resize-none bg-transparent p-4 text-sm text-slate-700 placeholder-slate-400 outline-none"
          placeholder="Напишите ответ клиенту... (Cmd + Enter для отправки)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isPending}
        />
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3">
          <p className="support-text-muted text-[11px] uppercase tracking-wider">
            Ответ будет отправлен в Telegram
          </p>
          <button
            onClick={handleSend}
            disabled={!text.trim() || isPending}
            className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
          >
            {isPending ? "Отправка..." : "Отправить"}
          </button>
        </div>
      </div>
    </div>
  );
}
