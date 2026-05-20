import { Button } from "@/shared/ui/button";
import type { SupportChatStatus } from "@/entities/support-chat";
import type { Manager } from "@/entities/manager";
import { ChatStatusSelector, StatusOption } from "./chat-status-selector";
import { TransferMenu } from "./transfer-menu";

type ChatActionPanelProps = {
  allManagers: Manager[];
  canTransferChat: boolean;
  canUseStatusSelector: boolean;
  isAdmin: boolean;
  isClaimable: boolean;
  isPending: boolean;
  selectedStatus: SupportChatStatus;
  showTransfer: boolean;
  visibleStatusOptions: StatusOption[];
  onDeleteChat: () => void;
  onStatusChange: (newStatus: SupportChatStatus) => void;
  onTakeIntoWork: () => void;
  onToggleTransfer: () => void;
  onTransfer: (targetManagerId: string) => void;
};

export function ChatActionPanel({
  allManagers,
  canTransferChat,
  canUseStatusSelector,
  isAdmin,
  isClaimable,
  isPending,
  selectedStatus,
  showTransfer,
  visibleStatusOptions,
  onDeleteChat,
  onStatusChange,
  onTakeIntoWork,
  onToggleTransfer,
  onTransfer,
}: ChatActionPanelProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {isClaimable ? (
        <Button onClick={onTakeIntoWork} isLoading={isPending} variant="primary">
          {isPending ? "Обработка..." : "Взять в работу"}
        </Button>
      ) : null}

      {canUseStatusSelector || canTransferChat ? (
        <>
          {canTransferChat ? (
            <TransferMenu
              allManagers={allManagers}
              isPending={isPending}
              isOpen={showTransfer}
              onToggle={onToggleTransfer}
              onTransfer={onTransfer}
            />
          ) : null}

          {canUseStatusSelector ? (
            <ChatStatusSelector
              status={selectedStatus}
              isPending={isPending}
              visibleStatusOptions={visibleStatusOptions}
              onStatusChange={onStatusChange}
            />
          ) : null}
        </>
      ) : null}

      {isAdmin ? (
        <Button
          onClick={onDeleteChat}
          isLoading={isPending}
          variant="danger"
          title="Удалить весь чат (только admin)"
        >
          🗑️ Удалить чат
        </Button>
      ) : null}
    </div>
  );
}
