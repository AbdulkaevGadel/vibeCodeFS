import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import type { ChatMessage } from "@/entities/chat-message";
import type { Manager } from "@/entities/manager";
import {
  getDeliveryBadgeLabel,
  getDeliveryBadgeVariant,
  getMessageCardClassName,
  getSafeDeliveryError,
  getSenderLabel,
  isOutgoingMessage,
} from "../lib/message-bubble-utils";

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
