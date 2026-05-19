import { Badge } from "@/shared/ui/badge";
import type { SupportChatSummary } from "@/entities/support-chat";
import type { ChatDetailsManager } from "../model/manager-types";

const detailsHeaderContentClassName = "min-w-0 flex-1";
const detailsEyebrowClassName = "support-text-muted text-xs uppercase tracking-[0.35em]";
const detailsTitleRowClassName = "flex min-w-0 flex-wrap items-start gap-3";
const detailsTitleClassName = "support-text-primary mt-2 min-w-0 break-all text-2xl font-semibold";
const detailsFullNameClassName = "support-text-secondary mt-2 text-sm";
const detailsMetaListClassName = "support-text-secondary mt-3 flex flex-wrap gap-2 text-xs";
const assignedManagerBadgeClassName =
  "mt-2 max-w-full rounded-lg px-2.5 py-1 text-[11px] uppercase tracking-wider whitespace-normal text-left";
const metaChipClassName = "px-3 py-1";

type ChatDetailsHeaderProps = {
  selectedChat: SupportChatSummary;
  messagesCount: number;
  allManagers: ChatDetailsManager[];
};

export function ChatDetailsHeader({ selectedChat, messagesCount, allManagers }: ChatDetailsHeaderProps) {
  const assignedManager = allManagers.find((manager) => manager.id === selectedChat.assignedManagerId);
  const assignedManagerRoleLabel = assignedManager?.role?.toUpperCase() ?? "Менеджер";

  return (
    <div className={detailsHeaderContentClassName}>
      <p className={detailsEyebrowClassName}>Диалог</p>
      <div className={detailsTitleRowClassName}>
        <h2 className={detailsTitleClassName}>{selectedChat.title}</h2>
        {selectedChat.assignedManagerName ? (
          <Badge variant="accent" size="sm" className={assignedManagerBadgeClassName}>
            {assignedManagerRoleLabel}: {selectedChat.assignedManagerName}
          </Badge>
        ) : null}
      </div>

      {selectedChat.fullName ? <p className={detailsFullNameClassName}>{selectedChat.fullName}</p> : null}

      <div className={detailsMetaListClassName}>
        <Badge variant="default" size="md" className={metaChipClassName}>сообщений: {messagesCount}</Badge>
        <Badge variant="default" size="md" className={metaChipClassName}>chat_id: {selectedChat.telegramChatId}</Badge>
        <Badge variant="default" size="md" className={`${metaChipClassName} uppercase`}>status: {selectedChat.status}</Badge>
      </div>
    </div>
  );
}
