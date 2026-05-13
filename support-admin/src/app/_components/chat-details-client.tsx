"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChatMessage, ChatStatus, ChatSummary, Manager } from "../_lib/page-types";
import {
  deleteChatAction,
  deleteMessageAction,
  markChatAsReadAction,
  takeChatIntoWorkAction,
  transferChatAction,
} from "../(protected)/_actions/chat-actions";
import { ChatMessageInput } from "./chat-message-input";
import { Toast } from "@/shared/ui/toast";
import { ChatActionPanel } from "./chat-details/chat-action-panel";
import { ChatDetailsHeader } from "./chat-details/chat-details-header";
import { StatusOption } from "./chat-details/chat-status-selector";
import { ComposerUnavailable } from "./chat-details/composer-unavailable";
import { MessageTimeline } from "./chat-details/message-timeline";
import { getComposerAvailability } from "./chat-details/chat-details-utils";
import {
  mergeInsertedMessage,
  mergeUpdatedDeliveryState,
  normalizeMessages,
  useChatDetailsRealtime,
} from "./chat-details/chat-details-realtime";
import { useSelectedChatReadState } from "./chat-details/use-selected-chat-read-state";
import { useScrollToBottom } from "./chat-details/use-scroll-to-bottom";

const detailsHeaderClassName =
  "flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between";

type ChatDetailsClientProps = {
  selectedChat: ChatSummary;
  initialMessages: ChatMessage[];
  selectedBotKey: string | null;
  allManagers: Manager[];
  currentManager: Manager | null;
};

type ToastState = {
  id: number;
  message: string;
  variant: "success" | "error";
};

const statusOptions: StatusOption[] = [
  { value: "open", label: "Открыть заново (open)" },
  { value: "waiting_operator", label: "Needs help (waiting_operator)" },
  { value: "in_progress", label: "В работе (in_progress)" },
  { value: "escalated", label: "Эскалирован (escalated)" },
  { value: "resolved", label: "Решен (resolved)" },
  { value: "closed", label: "Закрыт (closed)" },
];

export function ChatDetailsClient({ selectedChat, initialMessages, allManagers, currentManager }: ChatDetailsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [messages, setMessages] = useState<ChatMessage[]>(() => normalizeMessages(initialMessages));
  const [showTransfer, setShowTransfer] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, variant: ToastState["variant"]) => {
    setToast({
      id: Date.now(),
      message,
      variant,
    });
  };

  const syncMessages = useCallback((nextMessages: ChatMessage[]) => {
    setMessages(nextMessages);
  }, []);

  const closeTransferMenu = useCallback(() => {
    setShowTransfer(false);
  }, []);

  const handleRealtimeInsert = useCallback((message: ChatMessage) => {
    setMessages((currentMessages) => mergeInsertedMessage(currentMessages, message));

    if (message.senderType === "client") {
      markChatAsReadAction(message.chatId).catch((error) => {
        console.warn("Failed to mark realtime message as read:", error);
      });
    }
  }, []);

  const handleRealtimeDeliveryUpdate = useCallback(
    (updated: Parameters<typeof mergeUpdatedDeliveryState>[1]) => {
      setMessages((currentMessages) => mergeUpdatedDeliveryState(currentMessages, updated));
    },
    [],
  );

  const refreshDetails = useCallback(() => {
    router.refresh();
  }, [router]);

  useSelectedChatReadState({
    chatId: selectedChat.id,
    unreadCount: selectedChat.unreadCount,
    initialMessages,
    syncMessages,
    closeTransferMenu,
  });

  useChatDetailsRealtime({
    chatId: selectedChat.id,
    onInsertMessage: handleRealtimeInsert,
    onUpdateDeliveryState: handleRealtimeDeliveryUpdate,
    refreshDetails,
  });

  const handleTakeIntoWork = () => {
    startTransition(async () => {
      const result = await takeChatIntoWorkAction(selectedChat.id);
      if (!result.success) {
        showToast(result.error ? `Ошибка: ${result.error}` : "Не удалось взять чат в работу.", "error");
      } else {
        showToast("Чат взят в работу.", "success");
      }
    });
  };

  const handleTransfer = (targetManagerId: string) => {
    startTransition(async () => {
      const result = await transferChatAction(selectedChat.id, targetManagerId, selectedChat.assignedManagerId);
      if (!result.success) {
        showToast(result.error ? `Ошибка: ${result.error}` : "Не удалось передать чат.", "error");
      } else {
        setShowTransfer(false);
        showToast("Чат передан.", "success");
      }
    });
  };

  const handleStatusChange = (newStatus: ChatStatus) => {
    if (newStatus === selectedChat.status) return;

    let confirmationMsg = `Вы уверены, что хотите изменить статус на '${newStatus}'?`;
    if (newStatus === "open") {
      confirmationMsg = "Вы уверены, что хотите сбросить чат в 'open'? Это удалит текущее назначение на менеджера.";
    } else if (newStatus === "waiting_operator") {
      confirmationMsg = "Перевести чат в Needs help? Текущее назначение на менеджера будет снято.";
    } else if (newStatus === "resolved") {
       confirmationMsg = "Завершить этот диалог?";
    }

    if (!confirm(confirmationMsg)) return;

    startTransition(async () => {
      // Подгружаем новый экшен динамически, чтобы не раздувать импорты в начале (условно)
      const { updateChatStatusAction } = await import("../(protected)/_actions/chat-actions");
      const result = await updateChatStatusAction(selectedChat.id, newStatus, selectedChat.status);
      if (!result.success) {
        showToast(result.error ? `Ошибка: ${result.error}` : "Не удалось изменить статус чата.", "error");
      } else {
        showToast("Статус чата изменён.", "success");
      }
    });
  };

  useScrollToBottom(messagesEndRef, messages);

  const isResolved = selectedChat.status === "resolved" || selectedChat.status === "closed";
  const isClaimable = selectedChat.status === "open" || selectedChat.status === "waiting_operator";
  const isPrivilegedManager = currentManager?.role === "admin" || currentManager?.role === "supervisor";
  const isAssignedToCurrentManager = selectedChat.assignedManagerId === currentManager?.id;
  const canSupportChangeStatus =
    currentManager?.role === "support" && isAssignedToCurrentManager && selectedChat.status !== "escalated";
  const canUseStatusSelector = Boolean(isPrivilegedManager || canSupportChangeStatus);
  const canTransferChat = Boolean(!isResolved && !isClaimable && (isPrivilegedManager || isAssignedToCurrentManager));
  const composerAvailability = getComposerAvailability(selectedChat, currentManager);
  const visibleStatusOptions = statusOptions.filter((option) => {
    if (option.value === "waiting_operator") {
      return Boolean(isPrivilegedManager && !isResolved);
    }

    if (option.value === "open") {
      return Boolean(isPrivilegedManager || canSupportChangeStatus);
    }

    return true;
  });
  const isAdmin = currentManager?.role === "admin";

  const handleDeleteMessage = (messageId: string) => {
    if (!confirm("Удалить это сообщение? Это действие необратимо.")) return;
    startTransition(async () => {
      const result = await deleteMessageAction(messageId);
      if (!result.success) {
        showToast(result.error ? `Ошибка удаления: ${result.error}` : "Удаление сообщения не выполнено.", "error");
      } else {
        setMessages(prev => prev.filter(m => m.id !== messageId));
        showToast("Сообщение удалено.", "success");
      }
    });
  };

  const handleDeleteChat = () => {
    if (!confirm(`Удалить чат "${selectedChat.title}" полностью? Все сообщения и история будут уничтожены. Это действие необратимо!`)) return;
    startTransition(async () => {
      const result = await deleteChatAction(selectedChat.id);
      if (!result.success) {
        showToast(result.error ? `Ошибка: ${result.error}` : "Не удалось удалить чат.", "error");
      } else {
        showToast("Чат удалён.", "success");
      }
    });
  };

  return (
    <>
      <div className={detailsHeaderClassName}>
        <ChatDetailsHeader selectedChat={selectedChat} messagesCount={messages.length} allManagers={allManagers} />
        <ChatActionPanel
          allManagers={allManagers}
          canTransferChat={canTransferChat}
          canUseStatusSelector={canUseStatusSelector}
          isAdmin={isAdmin}
          isClaimable={isClaimable}
          isPending={isPending}
          selectedStatus={selectedChat.status}
          showTransfer={showTransfer}
          visibleStatusOptions={visibleStatusOptions}
          onDeleteChat={handleDeleteChat}
          onStatusChange={handleStatusChange}
          onTakeIntoWork={handleTakeIntoWork}
          onToggleTransfer={() => setShowTransfer((current) => !current)}
          onTransfer={handleTransfer}
        />
      </div>

      <MessageTimeline
        allManagers={allManagers}
        chatTitle={selectedChat.title}
        isAdmin={isAdmin}
        isPending={isPending}
        messages={messages}
        messagesEndRef={messagesEndRef}
        onDeleteMessage={handleDeleteMessage}
      />

      {composerAvailability.canSend ? (
          <ChatMessageInput
              chatId={selectedChat.id}
              onLocalMessage={(msg) => {
                setMessages(prev => normalizeMessages([...prev, msg]));
              }}
          />
      ) : (
        <ComposerUnavailable reason={composerAvailability.unavailableReason} />
      )}

      {toast ? (
        <Toast
          key={toast.id}
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast((current) => current?.id === toast.id ? null : current)}
        />
      ) : null}
    </>
  );
}
