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
        <span className={isActive ? activeCountClassName : inactiveCountClassName}>
          {chat.messageCount}
        </span>
      </div>

      <div className={isActive ? activeMetaClassName : inactiveMetaClassName}>
        <span>chat_id: {chat.telegramChatId}</span>
        <span>{lastActivityLabel}</span>
      </div>
    </a>
  );
}
