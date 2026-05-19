"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupportChatSummary } from "@/entities/support-chat";
import {
  mergeInsertedMessage,
  mergeUpdatedDeliveryState,
  normalizeMessages,
  type ChatMessage,
} from "@/entities/chat-message";
import { ChatMessageInput } from "./chat-message-input";
import { Toast } from "@/shared/ui/toast";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { ChatActionPanel } from "./chat-action-panel";
import { ChatDetailsHeader } from "./chat-details-header";
import { StatusOption } from "./chat-status-selector";
import { ComposerUnavailable } from "./composer-unavailable";
import { MessageTimeline } from "./message-timeline";
import { useChatDetailsRealtime } from "../api/chat-details-realtime";
import { getComposerAvailability } from "../lib/chat-details-utils";
import { useChatDetailsActions } from "../model/use-chat-details-actions";
import { useScrollToBottom } from "../model/use-scroll-to-bottom";
import { useSelectedChatReadState } from "../model/use-selected-chat-read-state";
import type { ChatDetailsActions } from "./chat-details";
import type { ChatDetailsManager } from "../model/manager-types";

const detailsHeaderClassName =
  "flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between";

type ChatDetailsClientProps = {
  selectedChat: SupportChatSummary;
  initialMessages: ChatMessage[];
  selectedBotKey: string | null;
  allManagers: ChatDetailsManager[];
  currentManager: ChatDetailsManager | null;
  actions: ChatDetailsActions;
};

const statusOptions: StatusOption[] = [
  { value: "open", label: "Открыть заново (open)" },
  { value: "waiting_operator", label: "Needs help (waiting_operator)" },
  { value: "in_progress", label: "В работе (in_progress)" },
  { value: "escalated", label: "Эскалирован (escalated)" },
  { value: "resolved", label: "Решен (resolved)" },
  { value: "closed", label: "Закрыт (closed)" },
];

export function ChatDetailsClient({
  selectedChat,
  initialMessages,
  allManagers,
  currentManager,
  actions,
}: ChatDetailsClientProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(() => normalizeMessages(initialMessages));
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const {
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
  } = useChatDetailsActions({
    selectedChat,
    actions,
    setMessages,
  });

  const syncMessages = useCallback((nextMessages: ChatMessage[]) => {
    setMessages(nextMessages);
  }, []);

  const handleRealtimeInsert = useCallback((message: ChatMessage) => {
    setMessages((currentMessages) => mergeInsertedMessage(currentMessages, message));

    if (message.senderType === "client") {
      actions.markChatAsRead(message.chatId).catch((error) => {
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
    markChatAsRead: actions.markChatAsRead,
  });

  useChatDetailsRealtime({
    chatId: selectedChat.id,
    onInsertMessage: handleRealtimeInsert,
    onUpdateDeliveryState: handleRealtimeDeliveryUpdate,
    refreshDetails,
  });

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
          onToggleTransfer={toggleTransferMenu}
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
          sendManagerMessage={actions.sendManagerMessage}
          onLocalMessage={(message) => {
            setMessages((currentMessages) => normalizeMessages([...currentMessages, message]));
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
          onClose={() => closeToast(toast.id)}
        />
      ) : null}

      <ConfirmDialog
        isOpen={confirmRequest !== null}
        title={confirmRequest?.title ?? ""}
        description={confirmRequest?.description ?? ""}
        confirmLabel={confirmRequest?.type === "status" ? "Изменить" : "Удалить"}
        variant={confirmRequest?.type === "status" ? "default" : "danger"}
        isPending={isPending}
        onCancel={closeConfirmDialog}
        onConfirm={handleConfirmAction}
      />
    </>
  );
}
