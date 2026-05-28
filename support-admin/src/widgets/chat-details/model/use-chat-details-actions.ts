"use client";

import { useCallback, useState, useTransition, type Dispatch, type SetStateAction } from "react";
import type { SupportChatStatus, SupportChatSummary } from "@/entities/support-chat";
import type { ChatMessage } from "@/entities/chat-message";
import { useToastState } from "@/shared/ui/toast";
import { getStatusChangeConfirmation } from "../lib/chat-details-status-utils";
import type { ChatDetailsActions } from "./types";

export type ConfirmRequest =
  | {
      type: "status";
      title: string;
      description: string;
      status: SupportChatStatus;
    }
  | {
      type: "delete-message";
      title: string;
      description: string;
      messageId: string;
    }
  | {
      type: "delete-chat";
      title: string;
      description: string;
    };

type UseChatDetailsActionsParams = {
  selectedChat: SupportChatSummary;
  actions: ChatDetailsActions;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
};

export function useChatDetailsActions({ selectedChat, actions, setMessages }: UseChatDetailsActionsParams) {
  const [isPending, startTransition] = useTransition();
  const [showTransfer, setShowTransfer] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const { toast, showToast, closeToast } = useToastState<"success" | "error">();

  const closeTransferMenu = useCallback(() => {
    setShowTransfer(false);
  }, []);

  const toggleTransferMenu = useCallback(() => {
    setShowTransfer((current) => !current);
  }, []);

  const closeConfirmDialog = useCallback(() => {
    setConfirmRequest(null);
  }, []);

  const handleTakeIntoWork = useCallback(() => {
    startTransition(async () => {
      const result = await actions.takeChatIntoWork(selectedChat.id);
      if (!result.success) {
        showToast(result.error ? `Ошибка: ${result.error}` : "Не удалось взять чат в работу.", "error");
      } else {
        showToast("Чат взят в работу.", "success");
      }
    });
  }, [actions, selectedChat.id, showToast]);

  const handleTransfer = useCallback(
    (targetManagerId: string) => {
      startTransition(async () => {
        const result = await actions.transferChat(selectedChat.id, targetManagerId, selectedChat.assignedManagerId);
        if (!result.success) {
          showToast(result.error ? `Ошибка: ${result.error}` : "Не удалось передать чат.", "error");
        } else {
          setShowTransfer(false);
          showToast("Чат передан.", "success");
        }
      });
    },
    [actions, selectedChat.assignedManagerId, selectedChat.id, showToast],
  );

  const handleStatusChange = useCallback(
    (newStatus: SupportChatStatus) => {
      if (newStatus === selectedChat.status) return;

      setConfirmRequest({
        type: "status",
        title: "Изменить статус чата",
        description: getStatusChangeConfirmation(newStatus),
        status: newStatus,
      });
    },
    [selectedChat.status],
  );

  const confirmStatusChange = useCallback(
    (newStatus: SupportChatStatus) => {
      startTransition(async () => {
        const result = await actions.updateChatStatus(selectedChat.id, newStatus, selectedChat.status);
        if (!result.success) {
          showToast(result.error ? `Ошибка: ${result.error}` : "Не удалось изменить статус чата.", "error");
        } else {
          setConfirmRequest(null);
          showToast("Статус чата изменён.", "success");
        }
      });
    },
    [actions, selectedChat.id, selectedChat.status, showToast],
  );

  const handleDeleteMessage = useCallback((messageId: string) => {
    setConfirmRequest({
      type: "delete-message",
      title: "Удалить сообщение",
      description: "Удалить это сообщение? Это действие необратимо.",
      messageId,
    });
  }, []);

  const confirmDeleteMessage = useCallback(
    (messageId: string) => {
      startTransition(async () => {
        const result = await actions.deleteMessage(messageId);
        if (!result.success) {
          showToast(result.error ? `Ошибка удаления: ${result.error}` : "Удаление сообщения не выполнено.", "error");
        } else {
          setMessages((currentMessages) => currentMessages.filter((message) => message.id !== messageId));
          setConfirmRequest(null);
          showToast("Сообщение удалено.", "success");
        }
      });
    },
    [actions, setMessages, showToast],
  );

  const handleDeleteChat = useCallback(() => {
    setConfirmRequest({
      type: "delete-chat",
      title: "Удалить чат",
      description: `Удалить чат "${selectedChat.title}" полностью? Все сообщения и история будут уничтожены. Это действие необратимо!`,
    });
  }, [selectedChat.title]);

  const confirmDeleteChat = useCallback(() => {
    startTransition(async () => {
      const result = await actions.deleteChat(selectedChat.id);
      if (!result.success) {
        showToast(result.error ? `Ошибка: ${result.error}` : "Не удалось удалить чат.", "error");
      } else {
        setConfirmRequest(null);
        showToast("Чат удалён.", "success");
      }
    });
  }, [actions, selectedChat.id, showToast]);

  const handleConfirmAction = useCallback(() => {
    if (!confirmRequest || isPending) return;

    if (confirmRequest.type === "status") {
      confirmStatusChange(confirmRequest.status);
      return;
    }

    if (confirmRequest.type === "delete-message") {
      confirmDeleteMessage(confirmRequest.messageId);
      return;
    }

    confirmDeleteChat();
  }, [confirmDeleteChat, confirmDeleteMessage, confirmRequest, confirmStatusChange, isPending]);

  return {
    closeConfirmDialog,
    closeToast,
    closeTransferMenu,
    confirmRequest,
    handleConfirmAction,
    handleDeleteChat,
    handleDeleteMessage,
    handleStatusChange,
    handleTakeIntoWork,
    handleTransfer,
    isPending,
    showTransfer,
    toast,
    toggleTransferMenu,
  };
}
