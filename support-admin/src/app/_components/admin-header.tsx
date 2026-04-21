"use client";

import { RefreshButton } from "../refresh-button";
import { BotOption, Manager } from "../_lib/page-types";
import { usePathname } from "next/navigation";
import { Button } from "./ui/button";
import { logoutAction } from "../_actions/logout";
import { BotTabs } from "./bot-tabs";
import { ManagersAdminModal } from "./managers-admin-modal";

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

type AdminHeaderProps = {
  headerBotLabel: string;
  messageCount: number;
  chatCount: number;
  botOptions: BotOption[];
  selectedBotKey: string | null;
  allManagers: Manager[];
  currentManager: Manager | null;
  kbTotalCount?: number;
  kbPublishedCount?: number;
};

export function AdminHeader({
  headerBotLabel,
  messageCount,
  chatCount,
  botOptions,
  selectedBotKey,
  allManagers,
  currentManager,
  kbTotalCount = 0,
  kbPublishedCount = 0,
}: AdminHeaderProps) {
  const pathname = usePathname();
  const isKnowledgeBase = pathname?.startsWith("/knowledge-base");

  return (
    <header className={headerClassName}>
      <div className={headerLayoutClassName}>
        <div>
          <p className={sectionTitleClassName}>VibeCode Support</p>
          <h1 className={headerTitleClassName}>{headerBotLabel}</h1>
          <p className={headerDescriptionClassName}>
            Relational read-only экран для просмотра чатов, клиентского контекста и истории
            сообщений по выбранному боту.
          </p>
        </div>

        <div className={statsWrapperClassName}>
          <div className={actionsWrapperClassName}>
            <RefreshButton />
            
            <Button 
              href={isKnowledgeBase ? "/" : "/knowledge-base"} 
              variant="secondary"
            >
              {isKnowledgeBase ? "← Вернуться к чатам" : "База знаний"}
            </Button>

            {currentManager?.role === "admin" ? (
              <ManagersAdminModal managers={allManagers} />
            ) : null}
            
            <form action={logoutAction}>
              <Button 
                type="submit" 
                variant="secondary"
              >
                <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Выйти
              </Button>
            </form>
          </div>

          <div className={statsGridClassName}>
            {!isKnowledgeBase && (
              <div className={darkStatCardClassName}>
                <p className={statLabelOnDarkClassName}>Бот</p>
                <p className={darkStatValueClassName}>{headerBotLabel}</p>
              </div>
            )}
            <div className={lightStatCardClassName}>
              <p className={statLabelClassName}>
                {isKnowledgeBase ? "Всего статей" : "Сообщений"}
              </p>
              <p className={statValueClassName}>
                {isKnowledgeBase ? kbTotalCount : messageCount}
              </p>
            </div>
            <div className={lightStatCardClassName}>
              <p className={statLabelClassName}>
                {isKnowledgeBase ? "Опубликовано" : "Чатов"}
              </p>
              <p className={statValueClassName}>
                {isKnowledgeBase ? kbPublishedCount : chatCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      {!isKnowledgeBase && <BotTabs botOptions={botOptions} selectedBotKey={selectedBotKey} />}
    </header>
  );
}
