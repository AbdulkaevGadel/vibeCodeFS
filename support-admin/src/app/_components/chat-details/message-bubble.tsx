import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { ChatMessage, Manager } from "../../_lib/page-types";
import { getManagerFullName } from "./chat-details-utils";

const messageCardClassName = "support-card p-4";
const messageHeaderClassName = "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between";
const messageAuthorNameClassName = "support-text-primary text-sm font-semibold";
const messageDateClassName = "support-text-muted mt-1 text-xs";
const messageTextClassName = "support-text-secondary mt-4 whitespace-pre-wrap break-words text-[15px] leading-7";
const deleteMessageButtonClassName = "!h-7 !w-7 !p-0 text-red-400 hover:text-red-700";

type MessageBubbleProps = {
  allManagers: Manager[];
  chatTitle: string;
  isAdmin: boolean;
  isPending: boolean;
  message: ChatMessage;
  onDeleteMessage: (messageId: string) => void;
};

function getSenderLabel(message: ChatMessage, chatTitle: string, allManagers: Manager[]) {
  if (message.senderType === "manager") {
    if (message.managerId) {
      const manager = allManagers.find((item) => item.id === message.managerId);
      if (manager) return getManagerFullName(manager);
    }

    return "Менеджер";
  }

  if (message.senderType === "ai") return "ИИ-помощник";
  if (message.senderType === "system") return "Система";
  return chatTitle;
}

function isOutgoingMessage(message: ChatMessage) {
  return message.senderType === "manager" || message.senderType === "ai";
}

function getMessageCardClassName(message: ChatMessage) {
  const baseClassName = `relative max-w-[80%] ${messageCardClassName} transition hover:shadow-md`;

  if (message.senderType === "manager") {
    return `${baseClassName} ml-auto border-l-4 border-l-slate-900 bg-white`;
  }

  if (message.senderType === "ai") {
    return `${baseClassName} ml-auto border-l-4 border-l-indigo-500 bg-indigo-50 ring-1 ring-indigo-100`;
  }

  if (message.senderType === "system") {
    return `${baseClassName} mx-auto max-w-[90%] border-dashed bg-slate-100`;
  }

  return `${baseClassName} mr-auto bg-slate-50`;
}

function getSafeDeliveryError(deliveryError: string | null) {
  if (!deliveryError) return undefined;

  const normalized = deliveryError.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;

  const unsafePatterns = [
    /authorization/i,
    /bearer\s+[a-z0-9._-]+/i,
    /token/i,
    /secret/i,
    /service[_-]?role/i,
    /internal_secret/i,
    /hf_[a-z0-9_]*api/i,
    /https?:\/\/\S+\?\S+/i,
    /\bat\s+\S+\s+\(/i,
  ];
  const looksStructuredPayload = /^[{[]/.test(normalized);
  const looksUnsafe = looksStructuredPayload || unsafePatterns.some((pattern) => pattern.test(normalized));

  if (looksUnsafe) return "Ошибка доставки";

  const maxLength = 140;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function getDeliveryBadgeLabel(deliveryStatus: ChatMessage["deliveryStatus"]) {
  if (deliveryStatus === "pending") return "⏳ Отправка";
  if (deliveryStatus === "sent") return "✅ Доставлено";
  return "❌ Ошибка";
}

function getDeliveryBadgeVariant(deliveryStatus: ChatMessage["deliveryStatus"]) {
  if (deliveryStatus === "pending") return "warning";
  if (deliveryStatus === "sent") return "success";
  return "danger";
}

export function MessageBubble({
  allManagers,
  chatTitle,
  isAdmin,
  isPending,
  message,
  onDeleteMessage,
}: MessageBubbleProps) {
  return (
    <article className={getMessageCardClassName(message)}>
      <div className={messageHeaderClassName}>
        <div>
          <p className={messageAuthorNameClassName}>{getSenderLabel(message, chatTitle, allManagers)}</p>
          <p className={messageDateClassName}>{new Date(message.createdAt).toLocaleString("ru-RU")}</p>
        </div>

        <div className="flex items-center gap-2">
          {isOutgoingMessage(message) && message.deliveryStatus ? (
            <Badge
              variant={getDeliveryBadgeVariant(message.deliveryStatus)}
              size="sm"
              title={getSafeDeliveryError(message.deliveryError)}
              className={message.deliveryStatus === "pending" ? "animate-pulse tracking-wider" : "tracking-wider"}
            >
              {getDeliveryBadgeLabel(message.deliveryStatus)}
            </Badge>
          ) : null}

          {isAdmin ? (
            <Button
              onClick={() => onDeleteMessage(message.id)}
              isLoading={isPending}
              variant="ghost"
              className={deleteMessageButtonClassName}
              title="Удалить сообщение"
            >
              🗑️
            </Button>
          ) : null}
        </div>
      </div>

      <p className={messageTextClassName}>{message.text || "Пустое сообщение"}</p>
    </article>
  );
}
