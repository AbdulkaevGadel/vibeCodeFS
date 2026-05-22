"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  ArticleStatus,
  KnowledgeArticle,
} from "@/entities/knowledge-article";
import type { KnowledgeDetailsActions } from "./types";
import { useArticleEmbeddingSync } from "./use-article-embedding-sync";

type KnowledgeArticleDraftValues = {
  title: string;
  content: string;
  slug: string;
  status: ArticleStatus;
};

type ShowToast = (message: string, variant: "success" | "error") => void;

type UseKnowledgeDetailsActionsArgs = {
  selectedArticle: KnowledgeArticle | null;
  draft: KnowledgeArticleDraftValues;
  actions: KnowledgeDetailsActions;
  finishEdit: () => void;
  closeDeleteConfirm: () => void;
  showToast: ShowToast;
};

export function useKnowledgeDetailsActions({
  selectedArticle,
  draft,
  actions,
  finishEdit,
  closeDeleteConfirm,
  showToast,
}: UseKnowledgeDetailsActionsArgs) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRefreshPending, startRefreshTransition] = useTransition();

  const handleEmbeddingTerminalState = useCallback(() => {
    router.refresh();
  }, [router]);

  const {
    manualEmbeddingStatus,
    setManualEmbeddingStatus,
    startEmbeddingRefreshSync,
  } = useArticleEmbeddingSync({
    articleId: selectedArticle?.id ?? null,
    getArticleEmbeddingState: actions.getArticleEmbeddingState,
    onTerminalState: handleEmbeddingTerminalState,
  });

  const displayedArticle = selectedArticle
    ? {
        ...selectedArticle,
        embeddingStatus: manualEmbeddingStatus ?? selectedArticle.embeddingStatus,
      }
    : null;

  const saveArticle = () => {
    startTransition(async () => {
      const result = await actions.upsertArticle(
        selectedArticle?.id ?? null,
        draft.title,
        draft.content,
        draft.slug,
        draft.status,
        selectedArticle?.version,
      );

      if (result.error) {
        showToast(result.error, "error");
        return;
      }

      finishEdit();
      showToast("Статья сохранена.", "success");

      const savedArticleId = result.data?.id ?? selectedArticle?.id ?? null;
      const savedArticleStatus = result.data?.status ?? draft.status;

      if (savedArticleStatus !== "published") {
        setManualEmbeddingStatus(null);
        router.refresh();
      } else if (savedArticleId) {
        const embeddingStateResult = await actions.getArticleEmbeddingState(savedArticleId);

        if (!embeddingStateResult.error && embeddingStateResult.data?.embeddingStatus === "updating") {
          setManualEmbeddingStatus("updating");
          startEmbeddingRefreshSync(savedArticleId);
        } else if (!embeddingStateResult.error && embeddingStateResult.data) {
          setManualEmbeddingStatus(embeddingStateResult.data.embeddingStatus);
          router.refresh();
        }
      } else {
        setManualEmbeddingStatus(null);
      }

      if (!selectedArticle && result.data) {
        router.push(`/knowledge-base?article=${result.data.id}`);
      }
    });
  };

  const changeStatus = (newStatus: ArticleStatus) => {
    if (!selectedArticle) {
      return;
    }

    startTransition(async () => {
      const result = await actions.setArticleStatus(
        selectedArticle.id,
        newStatus,
        selectedArticle.version,
      );

      if (result.error) {
        showToast(result.error, "error");
        return;
      }

      if (result.data) {
        showToast("Статус статьи изменён.", "success");
        router.push(newStatus === "archived" ? "/knowledge-base" : "/knowledge-base?view=archive");
        router.refresh();
      }
    });
  };

  const deleteArticle = () => {
    if (!selectedArticle) {
      return;
    }

    startTransition(async () => {
      const result = await actions.deleteArticle(selectedArticle.id, selectedArticle.version);

      if (result.error) {
        showToast(result.error, "error");
        return;
      }

      closeDeleteConfirm();
      showToast("Статья удалена.", "success");
      router.push("/knowledge-base?view=archive");
      router.refresh();
    });
  };

  const refreshEmbeddings = () => {
    if (!selectedArticle) {
      return;
    }

    startRefreshTransition(async () => {
      const result = await actions.refreshArticleEmbeddings(selectedArticle.id, selectedArticle.version);

      if (result.error) {
        showToast(result.error, "error");
        return;
      }

      const resultType = result.data?.type;

      if (
        resultType === "queued" ||
        resultType === "retry_queued" ||
        resultType === "already_updating"
      ) {
        startEmbeddingRefreshSync(selectedArticle.id);
      }

      showToast(result.message ?? "Обновление знаний ИИ запущено", "success");
      router.refresh();
    });
  };

  const cancelCreate = () => {
    router.push("/knowledge-base");
  };

  return {
    displayedArticle,
    isPending,
    isRefreshPending,
    saveArticle,
    changeStatus,
    deleteArticle,
    refreshEmbeddings,
    cancelCreate,
  };
}
