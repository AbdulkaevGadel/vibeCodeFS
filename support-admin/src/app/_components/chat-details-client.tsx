"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChatMessage, ChatStatus, ChatSummary, Manager } from "../_lib/page-types";
import { takeChatIntoWorkAction, resolveChatAction, transferChatAction, deleteMessageAction, deleteChatAction, markChatAsReadAction } from "../(protected)/_actions/chat-actions";
import { createSupabaseClient } from "@/lib/supabase";
import { ChatMessageInput } from "./chat-message-input";
import { Toast } from "@/shared/ui/toast";
import { ChatActionPanel } from "./chat-details/chat-action-panel";
import { ChatDetailsHeader } from "./chat-details/chat-details-header";
import { StatusOption } from "./chat-details/chat-status-selector";
import { ComposerUnavailable } from "./chat-details/composer-unavailable";
import { MessageTimeline } from "./chat-details/message-timeline";

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

type ComposerAvailability = {
  canSend: boolean;
  unavailableReason: string | null;
};

function sortMessagesByCreatedAt(messages: ChatMessage[]) {
  return [...messages].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

function dedupeMessagesById(messages: ChatMessage[]) {
  return Array.from(new Map(messages.map((message) => [message.id, message])).values());
}

function normalizeMessages(messages: ChatMessage[]) {
  return sortMessagesByCreatedAt(dedupeMessagesById(messages));
}

function getComposerAvailability(selectedChat: ChatSummary, currentManager: Manager | null): ComposerAvailability {
  if (!currentManager) {
    return {
      canSend: false,
      unavailableReason: "Профиль менеджера не найден. Ответить клиенту нельзя.",
    };
  }

  if (selectedChat.status === "resolved" || selectedChat.status === "closed") {
    return {
      canSend: false,
      unavailableReason: "Диалог завершён. История сохранена, новые сообщения отправить нельзя.",
    };
  }

  if (currentManager.role === "admin" || currentManager.role === "supervisor") {
    return {
      canSend: true,
      unavailableReason: null,
    };
  }

  if (currentManager.role === "support") {
    if (selectedChat.status === "escalated") {
      return {
        canSend: false,
        unavailableReason: "Чат эскалирован. Ответить может supervisor или admin.",
      };
    }

    if (selectedChat.assignedManagerId !== currentManager.id) {
      if (selectedChat.assignedManagerName) {
        return {
          canSend: false,
          unavailableReason: `Чат закреплён за ${selectedChat.assignedManagerName}. Ответить может назначенный менеджер.`,
        };
      }

      if (selectedChat.status !== "open" && selectedChat.status !== "waiting_operator") {
        return {
          canSend: false,
          unavailableReason: "Вы не назначены на этот чат. Ответить может назначенный менеджер.",
        };
      }

      return {
        canSend: false,
        unavailableReason: "Чтобы ответить клиенту, сначала возьмите чат в работу.",
      };
    }

    return {
      canSend: true,
      unavailableReason: null,
    };
  }

  return {
    canSend: false,
    unavailableReason: "Ответ недоступен для вашей роли или текущего состояния чата.",
  };
}

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
  const lastMarkedReadRef = useRef<string | null>(null);

  const showToast = (message: string, variant: ToastState["variant"]) => {
    setToast({
      id: Date.now(),
      message,
      variant,
    });
  };

  // Синхронизация при смене чата + сброс прочитанности
  useEffect(() => {
    setMessages(normalizeMessages(initialMessages));
    setShowTransfer(false);

    // Сброс прочитанности в базе при выборе чата (guard: только если есть непрочитанные и мы еще не помечали этот чат в текущей сессии)
    if (selectedChat.id && selectedChat.unreadCount > 0 && lastMarkedReadRef.current !== selectedChat.id) {
      lastMarkedReadRef.current = selectedChat.id;
      markChatAsReadAction(selectedChat.id).catch(err => 
        console.warn("Failed to mark chat as read:", err)
      );
    }
  }, [initialMessages, selectedChat.id, selectedChat.unreadCount]);

  // Realtime подписка
  useEffect(() => {
    const supabase = createSupabaseClient();
    
    const channel = supabase
      .channel(`chat_details:${selectedChat.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `chat_id=eq.${selectedChat.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newMessage = payload.new as any;
            if (newMessage.sender_type === "client") {
              markChatAsReadAction(selectedChat.id).catch(err =>
                console.warn("Failed to mark chat as read:", err)
              );
            }

            setMessages((prev) => {
              const formatted: ChatMessage = {
                id: newMessage.id,
                chatId: newMessage.chat_id,
                senderType: newMessage.sender_type,
                managerId: newMessage.manager_id,
                text: newMessage.text,
                deliveryStatus: newMessage.delivery_status,
                deliveryError: newMessage.delivery_error,
                clientMessageId: newMessage.client_message_id,
                legacyMessageId: newMessage.legacy_message_id,
                createdAt: newMessage.created_at,
              };

              if (prev.some((message) => message.id === formatted.id)) {
                return prev;
              }

              const withoutOptimisticDuplicate = formatted.clientMessageId
                ? prev.filter((message) => message.clientMessageId !== formatted.clientMessageId)
                : prev;

              return normalizeMessages([...withoutOptimisticDuplicate, formatted]);
            });
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as any;
            setMessages((prev) =>
              normalizeMessages(
                prev.map((m) =>
                  m.id === updated.id || m.clientMessageId === updated.client_message_id
                    ? {
                        ...m,
                        id: updated.id,
                        deliveryStatus: updated.delivery_status,
                        deliveryError: updated.delivery_error,
                      }
                    : m
                ),
              )
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chats",
          filter: `id=eq.${selectedChat.id}`,
        },
        () => {
          // Metadata (status, assigned manager) changed.
          // Trigger SSR refresh to get new props.
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedChat.id]);

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

  // Авто-скролл вниз при добавлении сообщений
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
