import { ChatSummary } from "../_lib/page-types";
import { getQueryString } from "../_lib/page-utils";

const activeItemClassName =
  "support-surface-accent block rounded-2xl px-4 py-4 shadow-lg";
const inactiveItemClassName =
  "support-surface-default support-text-primary block rounded-2xl px-4 py-4 transition hover:-translate-y-0.5 hover:border-slate-950 hover:shadow-md";
const itemContentClassName = "flex items-start justify-between gap-3";
const itemBodyClassName = "min-w-0";
const itemTitleClassName = "truncate text-base font-semibold";
const activeFullNameClassName = "mt-1 truncate text-xs text-[color:rgba(255,255,255,0.7)]";
const inactiveFullNameClassName = "support-text-muted mt-1 truncate text-xs";
const activeSubtitleClassName = "mt-2 truncate text-sm text-[color:rgba(255,255,255,0.82)]";
const inactiveSubtitleClassName = "support-text-secondary mt-2 truncate text-sm";
const activeCountClassName =
  "rounded-full bg-white/12 px-2 py-1 text-xs font-medium text-white";
const inactiveCountClassName =
  "support-surface-muted support-text-secondary rounded-full px-2 py-1 text-xs font-medium";
const activeNeedsHelpClassName =
  "rounded-full bg-amber-300/95 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-950 shadow-sm";
const inactiveNeedsHelpClassName =
  "rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700 ring-1 ring-amber-200";
const activeMetaClassName =
  "mt-4 flex items-center justify-between text-xs text-[color:rgba(255,255,255,0.65)]";
const inactiveMetaClassName = "support-text-muted mt-4 flex items-center justify-between text-xs";

type ChatListItemProps = {
  chat: ChatSummary;
  isActive: boolean;
  selectedBotKey: string | null;
};

export function ChatListItem({ chat, isActive, selectedBotKey }: ChatListItemProps) {
  const lastActivityLabel = chat.lastMessageAt
    ? new Date(chat.lastMessageAt).toLocaleDateString("ru-RU")
    : "нет сообщений";
  const needsHelp = chat.status === "waiting_operator";
  const showUnreadBadge = !isActive && chat.unreadCount > 0;

  return (
    <a
      href={getQueryString(selectedBotKey, chat.id)}
      className={isActive ? activeItemClassName : inactiveItemClassName}
    >
      <div className={itemContentClassName}>
        <div className={itemBodyClassName}>
          <p className={itemTitleClassName}>{chat.title}</p>

          {chat.fullName ? (
            <p className={isActive ? activeFullNameClassName : inactiveFullNameClassName}>
              {chat.fullName}
            </p>
          ) : null}
          <p className={isActive ? activeSubtitleClassName : inactiveSubtitleClassName}>
            {chat.subtitle}
          </p>
        </div>
        {(needsHelp || showUnreadBadge) && (
          <div className="flex flex-col items-end gap-1 pt-1">
            {needsHelp && (
              <span className={isActive ? activeNeedsHelpClassName : inactiveNeedsHelpClassName}>
                Needs help
              </span>
            )}
            {showUnreadBadge && (
              <span className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500">New</span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white shadow-sm ring-1 ring-white/10 animate-in zoom-in duration-300">
                  {chat.unreadCount}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className={isActive ? activeMetaClassName : inactiveMetaClassName}>
        <span>chat_id: {chat.telegramChatId}</span>
        <span>{lastActivityLabel}</span>
      </div>
    </a>
  );
}
