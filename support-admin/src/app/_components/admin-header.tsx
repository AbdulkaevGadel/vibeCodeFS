"use client";

import { useEffect, useState, useTransition } from "react";
import { RefreshButton } from "../refresh-button";
import {
  BotOption,
  KnowledgeEmbeddingRefreshBatch,
  KnowledgeEmbeddingSummary,
  Manager,
} from "../_lib/page-types";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/shared/ui/button";
import { Toast } from "@/shared/ui/toast";
import { logoutAction } from "../_actions/logout";
import { BotTabs } from "./bot-tabs";
import { ManagersAdminModal } from "./managers-admin-modal";
import {
  getKnowledgeEmbeddingRefreshBatchStateAction,
  startKnowledgeEmbeddingRefreshBatchAction,
} from "../(protected)/_actions/knowledge-actions";

const headerClassName = "support-panel-strong p-5 sm:p-6";
const headerLayoutClassName =
  "flex flex-col gap-5";
const headerTopClassName = "flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between";
const headerTitleWrapperClassName = "flex flex-wrap items-baseline gap-x-4 gap-y-1";
const headerBottomClassName = "grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(360px,520px)]";
const sectionTitleClassName = "support-text-secondary text-xs uppercase tracking-[0.35em]";
const headerTitleClassName = "support-text-primary text-3xl font-semibold tracking-tight";
const actionsWrapperClassName = "flex flex-wrap items-center gap-2 lg:justify-end";
const kbStatsGridClassName = "grid gap-3 sm:grid-cols-2";
const chatStatsGridClassName = "grid gap-3 md:grid-cols-3";
const darkStatCardClassName = "support-surface-accent rounded-2xl px-4 py-3";
const lightStatCardClassName = "support-surface-default rounded-2xl px-4 py-3";
const statLabelOnDarkClassName = "text-xs uppercase tracking-[0.24em] text-white/60";
const statLabelClassName = "support-text-muted text-xs uppercase tracking-[0.24em]";
const darkStatValueClassName = "mt-2 text-lg font-semibold";
const statValueClassName = "support-text-primary mt-2 text-2xl font-semibold";
const currentManagerPanelClassName =
  "support-surface-default rounded-2xl px-4 py-3";
const currentManagerMetaClassName = statLabelClassName;
const currentManagerNameClassName = "support-text-primary mt-2 truncate text-lg font-semibold";
const kbEmbeddingPanelClassName = "support-surface-default rounded-2xl px-4 py-3";
const kbEmbeddingHeaderClassName = "flex flex-wrap items-center justify-between gap-3";
const kbEmbeddingTitleWrapperClassName = "flex items-center gap-2";
const kbEmbeddingTitleClassName = "support-text-muted text-xs font-bold uppercase tracking-[0.22em]";
const kbEmbeddingHelpClassName =
  "inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] font-bold text-slate-500";
const kbEmbeddingStatsClassName = "mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4";
const kbEmbeddingStatClassName = "min-w-0 rounded-xl border border-slate-100 bg-white/70 px-3 py-2";
const kbEmbeddingStatLabelClassName = "support-text-muted block truncate text-[10px] font-bold uppercase tracking-[0.12em]";
const kbEmbeddingStatValueClassName = "support-text-primary mt-1 block text-base font-semibold";
const kbBatchProgressClassName = "mt-3 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs";
const kbBatchProgressHeaderClassName = "flex items-center justify-between gap-3";
const kbBatchProgressTextClassName = "support-text-primary font-semibold";
const kbBatchProgressMetaClassName = "support-text-muted";
const kbBatchProgressTrackClassName = "mt-2 h-2 overflow-hidden rounded-full bg-slate-100";
const kbBatchProgressFillClassName = "h-full rounded-full bg-slate-950 transition-all";
const kbBatchFooterClassName = "mt-3 flex flex-wrap items-center justify-between gap-2";
const kbBatchLogOverlayClassName = "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-sm";
const kbBatchLogPanelClassName = "max-h-[min(720px,calc(100vh-4rem))] w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl";
const kbBatchLogHeaderClassName = "flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4";
const kbBatchLogTitleClassName = "support-text-primary text-sm font-bold";
const kbBatchLogDescriptionClassName = "support-text-muted mt-1 text-xs";
const kbBatchLogBodyClassName = "max-h-[520px] space-y-3 overflow-y-auto p-5";
const kbBatchLogItemClassName = "rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800";
const kbBatchLogItemTitleClassName = "font-semibold";
const kbBatchLogItemMetaClassName = "mt-1 text-xs text-red-700/80";
const kbBatchLogEmptyClassName = "support-text-muted rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm";

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
  kbEmbeddingSummary?: KnowledgeEmbeddingSummary;
  kbEmbeddingRefreshBatch?: KnowledgeEmbeddingRefreshBatch | null;
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
  kbEmbeddingSummary,
  kbEmbeddingRefreshBatch = null,
}: AdminHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isKnowledgeBase = pathname?.startsWith("/knowledge-base");
  const isArchiveView = searchParams?.get("view") === "archive";
  const canManageKnowledgeArchive = currentManager?.role === "admin" || currentManager?.role === "supervisor";
  const statsGridClassName = isKnowledgeBase ? kbStatsGridClassName : chatStatsGridClassName;

  return (
    <header className={headerClassName}>
      <div className={headerLayoutClassName}>
        <div className={headerTopClassName}>
          <div className={headerTitleWrapperClassName}>
            <p className={sectionTitleClassName}>VibeCode Support</p>
            <h1 className={headerTitleClassName}>{headerBotLabel}</h1>
          </div>

          <div className={actionsWrapperClassName}>
            <RefreshButton />

            <Button
              href={isKnowledgeBase ? "/" : "/knowledge-base"}
              variant="secondary"
              size="sm"
            >
              {isKnowledgeBase ? "← Вернуться к чатам" : "База знаний"}
            </Button>

            {isKnowledgeBase && canManageKnowledgeArchive ? (
              <Button
                href={isArchiveView ? "/knowledge-base" : "/knowledge-base?view=archive"}
                variant="secondary"
                active={isArchiveView}
                size="sm"
              >
                {isArchiveView ? "Активные статьи" : "Архив"}
              </Button>
            ) : null}

            {currentManager?.role === "admin" ? (
              <ManagersAdminModal managers={allManagers} />
            ) : null}

            <form action={logoutAction}>
              <Button
                type="submit"
                variant="secondary"
                size="sm"
              >
                <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Выйти
              </Button>
            </form>
          </div>
        </div>

        <div className={headerBottomClassName}>
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

          {isKnowledgeBase && kbEmbeddingSummary ? (
            <KbEmbeddingRefreshPanel
              summary={kbEmbeddingSummary}
              initialBatch={kbEmbeddingRefreshBatch}
              canManage={canManageKnowledgeArchive}
              onSettled={() => router.refresh()}
            />
          ) : null}

          {!isKnowledgeBase && currentManager ? (
            <CurrentManagerPanel manager={currentManager} />
          ) : null}
        </div>
      </div>

      {!isKnowledgeBase && <BotTabs botOptions={botOptions} selectedBotKey={selectedBotKey} />}
    </header>
  );
}

type CurrentManagerPanelProps = {
  manager: Manager;
};

function CurrentManagerPanel({ manager }: CurrentManagerPanelProps) {
  const managerName = [manager.displayName, manager.lastName].filter(Boolean).join(" ");

  return (
    <div className={currentManagerPanelClassName}>
      <p className={currentManagerMetaClassName}>Вы вошли как</p>
      <p className={currentManagerNameClassName} title={`${managerName || manager.email || "Менеджер"} (${manager.role})`}>
        {managerName || manager.email || "Менеджер"} ({manager.role})
      </p>
    </div>
  );
}

type KbEmbeddingRefreshPanelProps = {
  summary: KnowledgeEmbeddingSummary;
  initialBatch: KnowledgeEmbeddingRefreshBatch | null;
  canManage: boolean;
  onSettled: () => void;
};

type KbEmbeddingToastState = {
  id: number;
  message: string;
  variant: "success" | "error";
};

function KbEmbeddingRefreshPanel({
  summary,
  initialBatch,
  canManage,
  onSettled,
}: KbEmbeddingRefreshPanelProps) {
  const [batch, setBatch] = useState(initialBatch);
  const [toast, setToast] = useState<KbEmbeddingToastState | null>(null);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isRunning = batch?.status === "running";
  const logItems = batch?.items.filter(isVisibleBatchLogItem) ?? [];
  const hasBatchLog = logItems.length > 0;
  const canOpenLog = hasBatchLog && !isRunning;
  const canRecoverRunningBatch = isRunning && summary.updatingCount === 0;
  const canStart = canManage && (
    (!isRunning && summary.refreshableCount > 0)
    || canRecoverRunningBatch
  );
  const startButtonLabel = isRunning ? "Продолжить" : "Обновить все";
  const progressPercent = batch && batch.totalCount > 0
    ? Math.round((batch.processedCount / batch.totalCount) * 100)
    : 0;

  useEffect(() => {
    setBatch(initialBatch);
  }, [initialBatch]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      const result = await getKnowledgeEmbeddingRefreshBatchStateAction();

      if (result.error) {
        showToast(result.error, "error");
        return;
      }

      setBatch(result.data ?? null);

      if (result.data && result.data.status !== "running") {
        onSettled();
      }
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [isRunning, onSettled]);

  const handleStart = () => {
    setToast(null);

    startTransition(async () => {
      const result = await startKnowledgeEmbeddingRefreshBatchAction();

      if (result.error) {
        setBatch(result.data ?? null);
        showToast(result.error, "error");
        return;
      }

      setBatch(result.data ?? null);
      showToast(result.message ?? "Массовое обновление знаний ИИ запущено.", "success");
    });
  };

  const showToast = (message: string, variant: KbEmbeddingToastState["variant"]) => {
    setToast({
      id: Date.now(),
      message,
      variant,
    });
  };

  return (
    <div className={kbEmbeddingPanelClassName}>
      <div className={kbEmbeddingHeaderClassName}>
        <div className={kbEmbeddingTitleWrapperClassName}>
          <p className={kbEmbeddingTitleClassName}>Знания ИИ</p>
          <span
            className={kbEmbeddingHelpClassName}
            title="Знания ИИ — это подготовленные embeddings базы знаний. Они нужны, чтобы ИИ мог находить релевантные статьи при ответе клиенту."
          >
            ?
          </span>
        </div>
        {canManage ? (
          <Button
            type="button"
            onClick={handleStart}
            isLoading={isPending}
            disabled={!canStart}
            variant="primary"
            size="sm"
          >
            {startButtonLabel}
          </Button>
        ) : null}
      </div>

      <div className={kbEmbeddingStatsClassName}>
        <EmbeddingStat label="Актуальны" value={summary.actualCount} />
        <EmbeddingStat label="К обновлению" value={summary.refreshableCount} />
        <EmbeddingStat label="В работе" value={summary.updatingCount} />
        <EmbeddingStat label="Ошибки" value={summary.failedCount} />
      </div>

      {batch ? (
        <div className={kbBatchProgressClassName}>
          <div className={kbBatchProgressHeaderClassName}>
            <span className={kbBatchProgressTextClassName}>
              Обработано {batch.processedCount} из {batch.totalCount}
            </span>
            <span className={kbBatchProgressMetaClassName}>
              {batch.status === "running" ? "В работе" : getBatchStatusLabel(batch.status)}
            </span>
          </div>
          <div className={kbBatchProgressTrackClassName}>
            <div
              className={kbBatchProgressFillClassName}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className={kbBatchProgressMetaClassName}>
            Успешно: {batch.completedCount} · Ошибок: {batch.failedCount} · Пропущено: {batch.skippedCount}
          </p>

          {canOpenLog ? (
            <div className={kbBatchFooterClassName}>
              <span className={kbBatchProgressMetaClassName}>
                Лог: {logItems.length}
              </span>
              <Button
                type="button"
                onClick={() => setIsLogOpen(true)}
                variant="secondary"
                size="sm"
              >
                Лог
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {toast ? (
        <Toast
          key={toast.id}
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast((current) => current?.id === toast.id ? null : current)}
        />
      ) : null}

      {batch && isLogOpen ? (
        <KbBatchLogModal
          batch={batch}
          items={logItems}
          onClose={() => setIsLogOpen(false)}
        />
      ) : null}
    </div>
  );
}

type EmbeddingStatProps = {
  label: string;
  value: number;
};

function EmbeddingStat({ label, value }: EmbeddingStatProps) {
  return (
    <div className={kbEmbeddingStatClassName}>
      <span className={kbEmbeddingStatLabelClassName}>{label}</span>
      <span className={kbEmbeddingStatValueClassName}>{value}</span>
    </div>
  );
}

type KbBatchLogModalProps = {
  batch: KnowledgeEmbeddingRefreshBatch;
  items: KnowledgeEmbeddingRefreshBatch["items"];
  onClose: () => void;
};

function KbBatchLogModal({ items, onClose }: KbBatchLogModalProps) {
  return (
    <div className={kbBatchLogOverlayClassName} role="dialog" aria-modal="true">
      <div className={kbBatchLogPanelClassName}>
        <div className={kbBatchLogHeaderClassName}>
          <div>
            <p className={kbBatchLogTitleClassName}>Лог обновления знаний ИИ</p>
            <p className={kbBatchLogDescriptionClassName}>
              Ошибки и пропущенные статьи последнего batch.
            </p>
          </div>
          <Button type="button" onClick={onClose} variant="secondary" size="sm">
            Закрыть
          </Button>
        </div>

        <div className={kbBatchLogBodyClassName}>
          {items.length === 0 ? (
            <p className={kbBatchLogEmptyClassName}>Лог пуст.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className={kbBatchLogItemClassName}>
                <p className={kbBatchLogItemTitleClassName}>{item.articleTitle}</p>
                <p className={kbBatchLogItemMetaClassName}>
                  {item.resultType ?? item.status}
                  {item.errorMessage ? `: ${item.errorMessage}` : ""}
                </p>
                {item.processedAt ? (
                  <p className={kbBatchLogItemMetaClassName}>
                    {new Date(item.processedAt).toLocaleString("ru-RU")}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function isVisibleBatchLogItem(item: KnowledgeEmbeddingRefreshBatch["items"][number]) {
  return item.status === "failed"
    || (
      item.status === "skipped"
      && item.resultType !== "INGESTION_ALREADY_PROCESSING"
      && item.resultType !== "ALREADY_ACTUAL"
    );
}

function getBatchStatusLabel(status: KnowledgeEmbeddingRefreshBatch["status"]) {
  if (status === "completed") {
    return "Готово";
  }

  if (status === "completed_with_errors") {
    return "Готово с ошибками";
  }

  if (status === "failed") {
    return "Ошибка";
  }

  return "В работе";
}
