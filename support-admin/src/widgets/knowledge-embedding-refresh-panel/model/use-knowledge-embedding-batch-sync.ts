"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  KnowledgeEmbeddingRefreshBatch,
  KnowledgeEmbeddingSummary,
} from "@/entities/knowledge-article";
import { useToastState } from "@/shared/ui/toast";
import type { KnowledgeEmbeddingRefreshPanelActions } from "./types";

type UseKnowledgeEmbeddingBatchSyncParams = {
  initialBatch: KnowledgeEmbeddingRefreshBatch | null;
  summary: KnowledgeEmbeddingSummary;
  canManage: boolean;
  actions: KnowledgeEmbeddingRefreshPanelActions;
};

function isVisibleBatchLogItem(item: KnowledgeEmbeddingRefreshBatch["items"][number]) {
  return item.status === "failed"
    || (
      item.status === "skipped"
      && item.resultType !== "INGESTION_ALREADY_PROCESSING"
      && item.resultType !== "ALREADY_ACTUAL"
    );
}

function getVisibleLogBatch(batch: KnowledgeEmbeddingRefreshBatch | null) {
  if (!batch) {
    return null;
  }

  return batch.items.some(isVisibleBatchLogItem) ? batch : null;
}

export function useKnowledgeEmbeddingBatchSync({
  initialBatch,
  summary,
  canManage,
  actions,
}: UseKnowledgeEmbeddingBatchSyncParams) {
  const router = useRouter();
  const [batch, setBatch] = useState(initialBatch);
  const [logBatch, setLogBatch] = useState<KnowledgeEmbeddingRefreshBatch | null>(() => getVisibleLogBatch(initialBatch));
  const { toast, showToast, closeToast, clearToast } = useToastState<"success" | "error">();
  const [isPending, startTransition] = useTransition();
  const isRunning = batch?.status === "running";
  const logItems = logBatch?.items.filter(isVisibleBatchLogItem) ?? [];
  const canOpenLog = logItems.length > 0;
  const canRecoverRunningBatch = isRunning && summary.updatingCount === 0;
  const canStart = canManage && (
    (!isRunning && summary.refreshableCount > 0)
    || canRecoverRunningBatch
  );
  const startButtonLabel = isRunning ? "Продолжить" : "Обновить все";

  useEffect(() => {
    // Server refreshes can replace the current batch while the local poller is active.
    /* eslint-disable react-hooks/set-state-in-effect */
    setBatch(initialBatch);
    setLogBatch((current) => getVisibleLogBatch(initialBatch) ?? current);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [initialBatch]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      const result = await actions.getBatchState();

      if (result.error) {
        showToast(result.error, "error");
        return;
      }

      setBatch(result.data ?? null);
      setLogBatch((current) => getVisibleLogBatch(result.data ?? null) ?? current);

      if (result.data && result.data.status !== "running") {
        router.refresh();
      }
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [actions, isRunning, router, showToast]);

  const startBatch = () => {
    clearToast();

    startTransition(async () => {
      const result = await actions.startBatch();

      if (result.error) {
        setBatch(result.data ?? null);
        setLogBatch((current) => getVisibleLogBatch(result.data ?? null) ?? current);
        showToast(result.error, "error");
        return;
      }

      setBatch(result.data ?? null);
      setLogBatch((current) => getVisibleLogBatch(result.data ?? null) ?? current);
      showToast(result.message ?? "Массовое обновление знаний ИИ запущено.", "success");
    });
  };

  return {
    batch,
    canOpenLog,
    canStart,
    closeToast,
    isPending,
    logItems,
    startBatch,
    startButtonLabel,
    toast,
  };
}
