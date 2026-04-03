import { RefreshButton } from "../refresh-button";
import { BotOption } from "../_lib/page-types";
import { logoutAction } from "../_actions/logout";
import { BotTabs } from "./bot-tabs";

const headerClassName = "support-panel-strong p-6";
const headerLayoutClassName =
  "flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between";
const sectionTitleClassName = "support-text-secondary text-xs uppercase tracking-[0.35em]";
const headerTitleClassName = "support-text-primary mt-3 text-3xl font-semibold tracking-tight";
const headerDescriptionClassName = "support-text-secondary mt-2 max-w-2xl text-sm";
const statsWrapperClassName = "flex flex-col gap-3";
const actionsWrapperClassName = "flex flex-wrap justify-start gap-3 xl:justify-end";
const statsGridClassName = "grid gap-3 sm:grid-cols-3";
const darkStatCardClassName = "support-surface-accent rounded-2xl px-4 py-3";
const lightStatCardClassName = "support-surface-default rounded-2xl px-4 py-3";
const statLabelOnDarkClassName = "text-xs uppercase tracking-[0.24em] text-white/60";
const statLabelClassName = "support-text-muted text-xs uppercase tracking-[0.24em]";
const darkStatValueClassName = "mt-2 text-lg font-semibold";
const statValueClassName = "support-text-primary mt-2 text-2xl font-semibold";
const logoutButtonClassName =
  "rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800";

type AdminHeaderProps = {
  headerBotLabel: string;
  messageCount: number;
  chatCount: number;
  botOptions: BotOption[];
  selectedBotKey: string | null;
};

export function AdminHeader({
  headerBotLabel,
  messageCount,
  chatCount,
  botOptions,
  selectedBotKey,
}: AdminHeaderProps) {
  return (
    <header className={headerClassName}>
      <div className={headerLayoutClassName}>
        <div>
          <p className={sectionTitleClassName}>SupportBot Admin</p>
          <h1 className={headerTitleClassName}>{headerBotLabel}</h1>
          <p className={headerDescriptionClassName}>
            Одна страница для просмотра сообщений, выбора чатов и безопасного удаления через
            серверную сторону.
          </p>
        </div>

        <div className={statsWrapperClassName}>
          <div className={actionsWrapperClassName}>
            <RefreshButton />
            <form action={logoutAction}>
              <button type="submit" className={logoutButtonClassName}>
                Выйти
              </button>
            </form>
          </div>

          <div className={statsGridClassName}>
            <div className={darkStatCardClassName}>
              <p className={statLabelOnDarkClassName}>Бот</p>
              <p className={darkStatValueClassName}>{headerBotLabel}</p>
            </div>
            <div className={lightStatCardClassName}>
              <p className={statLabelClassName}>Сообщений</p>
              <p className={statValueClassName}>{messageCount}</p>
            </div>
            <div className={lightStatCardClassName}>
              <p className={statLabelClassName}>Чатов</p>
              <p className={statValueClassName}>{chatCount}</p>
            </div>
          </div>
        </div>
      </div>

      <BotTabs botOptions={botOptions} selectedBotKey={selectedBotKey} />
    </header>
  );
}
