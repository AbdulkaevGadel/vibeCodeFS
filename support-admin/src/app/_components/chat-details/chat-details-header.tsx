import { ChatSummary, Manager } from "../../_lib/page-types";

const detailsHeaderContentClassName = "flex-1";
const detailsEyebrowClassName = "support-text-muted text-xs uppercase tracking-[0.35em]";
const detailsTitleClassName = "support-text-primary mt-2 text-2xl font-semibold";
const detailsFullNameClassName = "support-text-secondary mt-2 text-sm";
const detailsMetaListClassName = "support-text-secondary mt-3 flex flex-wrap gap-2 text-xs";
const assignedManagerBadgeClassName =
  "mt-2 flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-indigo-600 ring-1 ring-inset ring-indigo-500/20";
const metaChipClassName = "support-chip flex items-center gap-1.5 rounded-full px-3 py-1 ring-1 ring-slate-200";
const statusMetaChipClassName = `${metaChipClassName} font-bold uppercase`;

type ChatDetailsHeaderProps = {
  selectedChat: ChatSummary;
  messagesCount: number;
  allManagers: Manager[];
};

export function ChatDetailsHeader({ selectedChat, messagesCount, allManagers }: ChatDetailsHeaderProps) {
  const assignedManager = allManagers.find((manager) => manager.id === selectedChat.assignedManagerId);
  const assignedManagerRoleLabel = assignedManager?.role?.toUpperCase() ?? "Менеджер";

  return (
    <div className={detailsHeaderContentClassName}>
      <p className={detailsEyebrowClassName}>Диалог</p>
      <div className="flex items-center gap-3">
        <h2 className={detailsTitleClassName}>{selectedChat.title}</h2>
        {selectedChat.assignedManagerName ? (
          <span className={assignedManagerBadgeClassName}>
            {assignedManagerRoleLabel}: {selectedChat.assignedManagerName}
          </span>
        ) : null}
      </div>

      {selectedChat.fullName ? <p className={detailsFullNameClassName}>{selectedChat.fullName}</p> : null}

      <div className={detailsMetaListClassName}>
        <span className={metaChipClassName}>сообщений: {messagesCount}</span>
        <span className={metaChipClassName}>chat_id: {selectedChat.telegramChatId}</span>
        <span className={statusMetaChipClassName}>status: {selectedChat.status}</span>
      </div>
    </div>
  );
}
