"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupportChatSummary } from "@/entities/support-chat";
import type { Manager } from "@/entities/manager";
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
import {
  getChatDetailsViewState,
  getConfirmDialogViewState,
} from "../lib/chat-details-view-state";
import { useChatDetailsActions } from "../model/use-chat-details-actions";
import { useScrollToBottom } from "../model/use-scroll-to-bottom";
import { useSelectedChatReadState } from "../model/use-selected-chat-read-state";
import type { ChatDetailsActions } from "../model";

const detailsHeaderClassName =
  "flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between";

type ChatDetailsClientProps = {
  selectedChat: SupportChatSummary;
  initialMessages: ChatMessage[];
  selectedBotKey: string | null;
  allManagers: Manager[];
  currentManager: Manager | null;
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

  const {
    canTransferChat,
    canUseStatusSelector,
    composerAvailability,
    isAdmin,
    isClaimable,
    visibleStatusOptions,
  } = getChatDetailsViewState({
    selectedChat,
    currentManager,
    statusOptions,
  });
  const confirmDialog = getConfirmDialogViewState(confirmRequest);

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
  }, [actions]);

  const handleRealtimeDeliveryUpdate = useCallback(
    (updated: Parameters<typeof mergeUpdatedDeliveryState>[1]) => {
      setMessages((currentMessages) => mergeUpdatedDeliveryState(currentMessages, updated));
    },
    [],
  );

  const refreshDetails = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleLocalMessage = useCallback((message: ChatMessage) => {
    setMessages((currentMessages) => normalizeMessages([...currentMessages, message]));
  }, []);

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
          onLocalMessage={handleLocalMessage}
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
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        isPending={isPending}
        onCancel={closeConfirmDialog}
        onConfirm={handleConfirmAction}
      />
    </>
  );
}
