"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ArticleEmbeddingStatus, KnowledgeArticle } from "@/entities/knowledge-article";

type UseArticleEmbeddingSyncArgs = {
  articleId: string | null;
  getArticleEmbeddingState: (
    id: string,
  ) => Promise<{
    data?: Pick<KnowledgeArticle, "embeddingStatus" | "embeddingChunkSetId" | "embeddingErrorMessage"> | null;
    error?: string;
  }>;
  onTerminalState: () => void;
};

type ManualEmbeddingState = {
  articleId: string;
  status: ArticleEmbeddingStatus;
};

type TerminalReason = "completed" | "max_attempts";

const embeddingRefreshSyncDelayMs = 2500;
const embeddingRefreshSyncMaxAttempts = 12;

export function useArticleEmbeddingSync({
  articleId,
  getArticleEmbeddingState,
  onTerminalState,
}: UseArticleEmbeddingSyncArgs) {
  const [isEmbeddingRefreshSyncing, setIsEmbeddingRefreshSyncing] = useState(false);
  const [manualEmbeddingState, setManualEmbeddingState] = useState<ManualEmbeddingState | null>(null);
  const [syncArticleId, setSyncArticleId] = useState<string | null>(null);
  const [pollTick, setPollTick] = useState(0);
  const embeddingRefreshSyncAttemptsRef = useRef(0);
  const manualEmbeddingStatus =
    manualEmbeddingState?.articleId === articleId ? manualEmbeddingState.status : null;

  const setManualEmbeddingStatus = useCallback((status: ArticleEmbeddingStatus | null) => {
    if (!articleId || !status) {
      setManualEmbeddingState(null);
      return;
    }

    setManualEmbeddingState({ articleId, status });
  }, [articleId]);

  const startEmbeddingRefreshSync = useCallback((nextArticleId?: string | null) => {
    const nextSyncArticleId = nextArticleId ?? articleId;

    embeddingRefreshSyncAttemptsRef.current = 0;
    setSyncArticleId(nextSyncArticleId);
    setPollTick(0);
    setIsEmbeddingRefreshSyncing(!!nextSyncArticleId);

    if (nextSyncArticleId) {
      setManualEmbeddingState({ articleId: nextSyncArticleId, status: "updating" });
    }
  }, [articleId]);

  const stopEmbeddingRefreshSync = useCallback((reason: TerminalReason) => {
    setIsEmbeddingRefreshSyncing(false);
    setSyncArticleId(null);
    setPollTick(0);

    if (reason === "max_attempts") {
      onTerminalState();
    }
  }, [onTerminalState]);

  useEffect(() => {
    if (!isEmbeddingRefreshSyncing || !syncArticleId) {
      return;
    }

    let isCancelled = false;

    const timeoutId = window.setTimeout(() => {
      embeddingRefreshSyncAttemptsRef.current += 1;

      void getArticleEmbeddingState(syncArticleId).then((result) => {
        if (isCancelled) {
          return;
        }

        if (result.error || !result.data) {
          if (embeddingRefreshSyncAttemptsRef.current >= embeddingRefreshSyncMaxAttempts) {
            stopEmbeddingRefreshSync("max_attempts");
          } else {
            setPollTick((currentTick) => currentTick + 1);
          }
          return;
        }

        setManualEmbeddingState({
          articleId: syncArticleId,
          status: result.data.embeddingStatus,
        });

        if (result.data.embeddingStatus !== "updating") {
          stopEmbeddingRefreshSync("completed");
          onTerminalState();
          return;
        }

        if (embeddingRefreshSyncAttemptsRef.current >= embeddingRefreshSyncMaxAttempts) {
          stopEmbeddingRefreshSync("max_attempts");
          return;
        }

        setPollTick((currentTick) => currentTick + 1);
      });
    }, embeddingRefreshSyncDelayMs);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    isEmbeddingRefreshSyncing,
    getArticleEmbeddingState,
    onTerminalState,
    pollTick,
    stopEmbeddingRefreshSync,
    syncArticleId,
  ]);

  return {
    isEmbeddingRefreshSyncing,
    manualEmbeddingStatus,
    setManualEmbeddingStatus,
    startEmbeddingRefreshSync,
  };
}
