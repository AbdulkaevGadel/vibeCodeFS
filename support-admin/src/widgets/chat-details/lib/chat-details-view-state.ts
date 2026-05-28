import type { SupportChatSummary } from "@/entities/support-chat";
import { isAdminManager, isPrivilegedManager, type Manager } from "@/entities/manager";
import type { ConfirmRequest } from "../model/use-chat-details-actions";
import type { StatusOption } from "../ui/chat-status-selector";
import { getComposerAvailability } from "./chat-details-composer-utils";

type ChatDetailsViewStateParams = {
  selectedChat: SupportChatSummary;
  currentManager: Manager | null;
  statusOptions: StatusOption[];
};

export function getChatDetailsViewState({
  selectedChat,
  currentManager,
  statusOptions,
}: ChatDetailsViewStateParams) {
  const isResolved = selectedChat.status === "resolved" || selectedChat.status === "closed";
  const isClaimable = selectedChat.status === "open" || selectedChat.status === "waiting_operator";
  const canUsePrivilegedRole = isPrivilegedManager(currentManager);
  const isAssignedToCurrentManager = selectedChat.assignedManagerId === currentManager?.id;
  const canSupportChangeStatus =
    currentManager?.role === "support" && isAssignedToCurrentManager && selectedChat.status !== "escalated";
  const canUseStatusSelector = Boolean(canUsePrivilegedRole || canSupportChangeStatus);
  const canTransferChat = Boolean(!isResolved && !isClaimable && (canUsePrivilegedRole || isAssignedToCurrentManager));
  const composerAvailability = getComposerAvailability(selectedChat, currentManager);
  const visibleStatusOptions = statusOptions.filter((option) => {
    if (option.value === "waiting_operator") {
      return Boolean(canUsePrivilegedRole && !isResolved);
    }

    if (option.value === "open") {
      return Boolean(canUsePrivilegedRole || canSupportChangeStatus);
    }

    return true;
  });

  return {
    canTransferChat,
    canUseStatusSelector,
    composerAvailability,
    isAdmin: isAdminManager(currentManager),
    isClaimable,
    visibleStatusOptions,
  };
}

export function getConfirmDialogViewState(confirmRequest: ConfirmRequest | null) {
  return {
    isOpen: confirmRequest !== null,
    title: confirmRequest?.title ?? "",
    description: confirmRequest?.description ?? "",
    confirmLabel: confirmRequest?.type === "status" ? "Изменить" : "Удалить",
    variant: confirmRequest?.type === "status" ? "default" as const : "danger" as const,
  };
}
