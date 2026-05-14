"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { TooltipMarker } from "@/shared/ui/tooltip-marker";
import { Toast } from "@/shared/ui/toast";
import {
  KnowledgeEmbeddingRefreshBatch,
  KnowledgeEmbeddingSummary,
} from "../../_lib/page-types";
import { KnowledgeBatchLogModal } from "./knowledge-batch-log-modal";
import { KnowledgeBatchProgress } from "./knowledge-batch-progress";
import { KnowledgeEmbeddingStat } from "./knowledge-embedding-stat";
import { useKnowledgeEmbeddingBatchSync } from "./use-knowledge-embedding-batch-sync";

const kbEmbeddingPanelClassName = "support-surface-default rounded-2xl px-4 py-3";
const kbEmbeddingHeaderClassName = "flex flex-wrap items-center justify-between gap-3";
const kbEmbeddingTitleWrapperClassName = "flex items-center gap-2";
const kbEmbeddingHeaderActionsClassName = "flex flex-wrap items-center gap-2";
const kbEmbeddingTitleClassName = "support-text-muted text-xs font-bold uppercase tracking-[0.22em]";
const kbEmbeddingStatsClassName = "mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4";

type KnowledgeEmbeddingRefreshPanelProps = {
  summary: KnowledgeEmbeddingSummary;
  initialBatch: KnowledgeEmbeddingRefreshBatch | null;
  canManage: boolean;
};

export function KnowledgeEmbeddingRefreshPanel({
  summary,
  initialBatch,
  canManage,
}: KnowledgeEmbeddingRefreshPanelProps) {
  const [isLogOpen, setIsLogOpen] = useState(false);
  const {
    batch,
    canOpenLog,
    canStart,
    closeToast,
    isPending,
    logItems,
    startBatch,
    startButtonLabel,
    toast,
  } = useKnowledgeEmbeddingBatchSync({
    initialBatch,
    summary,
    canManage,
  });

  return (
    <div className={kbEmbeddingPanelClassName}>
      <div className={kbEmbeddingHeaderClassName}>
        <div className={kbEmbeddingTitleWrapperClassName}>
          <p className={kbEmbeddingTitleClassName}>Знания ИИ</p>
          <TooltipMarker content="Знания ИИ — это подготовленные embeddings базы знаний. Они нужны, чтобы ИИ мог находить релевантные статьи при ответе клиенту." />
        </div>
        <div className={kbEmbeddingHeaderActionsClassName}>
          {canOpenLog ? (
            <Button
              type="button"
              onClick={() => setIsLogOpen(true)}
              variant="secondary"
              size="sm"
            >
              Лог
            </Button>
          ) : null}
          {canManage ? (
            <Button
              type="button"
              onClick={startBatch}
              isLoading={isPending}
              disabled={!canStart}
              variant="primary"
              size="sm"
            >
              {startButtonLabel}
            </Button>
          ) : null}
        </div>
      </div>

      <div className={kbEmbeddingStatsClassName}>
        <KnowledgeEmbeddingStat label="Актуальны" value={summary.actualCount} />
        <KnowledgeEmbeddingStat label="К обновлению" value={summary.refreshableCount} />
        <KnowledgeEmbeddingStat label="В работе" value={summary.updatingCount} />
        <KnowledgeEmbeddingStat label="Ошибки" value={summary.failedCount} />
      </div>

      {batch ? (
        <KnowledgeBatchProgress
          batch={batch}
          visibleLogCount={logItems.length}
        />
      ) : null}

      {toast ? (
        <Toast
          key={toast.id}
          message={toast.message}
          variant={toast.variant}
          onClose={() => closeToast(toast.id)}
        />
      ) : null}

      {canOpenLog && isLogOpen ? (
        <KnowledgeBatchLogModal
          items={logItems}
          onClose={() => setIsLogOpen(false)}
        />
      ) : null}
    </div>
  );
}
