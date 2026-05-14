"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToastState } from "@/shared/ui/toast";
import {
  getKnowledgeEmbeddingRefreshBatchStateAction,
  startKnowledgeEmbeddingRefreshBatchAction,
} from "../../(protected)/_actions/knowledge-actions";
import {
  KnowledgeEmbeddingRefreshBatch,
  KnowledgeEmbeddingSummary,
} from "../../_lib/page-types";

type UseKnowledgeEmbeddingBatchSyncParams = {
  initialBatch: KnowledgeEmbeddingRefreshBatch | null;
  summary: KnowledgeEmbeddingSummary;
  canManage: boolean;
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
    setBatch(initialBatch);
    setLogBatch((current) => getVisibleLogBatch(initialBatch) ?? current);
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
      setLogBatch((current) => getVisibleLogBatch(result.data ?? null) ?? current);

      if (result.data && result.data.status !== "running") {
        router.refresh();
      }
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [isRunning, router, showToast]);

  const startBatch = () => {
    clearToast();

    startTransition(async () => {
      const result = await startKnowledgeEmbeddingRefreshBatchAction();

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
