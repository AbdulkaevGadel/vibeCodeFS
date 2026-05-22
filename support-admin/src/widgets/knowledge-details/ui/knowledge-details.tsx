"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  ArticleStatus,
  KnowledgeArticle,
  KnowledgeArticleHistory,
} from "@/entities/knowledge-article";
import { isPrivilegedManager, type Manager } from "@/entities/manager";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { Toast, useToastState } from "@/shared/ui/toast";
import { KnowledgeArticleForm } from "./knowledge-article-form";
import { KnowledgeArticleHistoryList } from "./knowledge-article-history";
import { KnowledgeArticleView } from "./knowledge-article-view";
import { KnowledgeDetailsHeader } from "./knowledge-details-header";
import type { KnowledgeDetailsActions } from "../model";
import { useArticleEmbeddingSync } from "../model/use-article-embedding-sync";
import { useKnowledgeArticleDraft } from "../model/use-knowledge-article-draft";

type KnowledgeDetailsProps = {
  selectedArticle: KnowledgeArticle | null;
  history: KnowledgeArticleHistory[];
  currentManager: Manager | null;
  isCreatingArticle: boolean;
  actions: KnowledgeDetailsActions;
};

const emptyStateClassName = "h-[calc(100vh-200px)]";
const detailsPanelClassName = "flex flex-col h-[calc(100vh-200px)] overflow-hidden support-panel";
const contentScrollClassName = "flex-1 overflow-y-auto custom-scrollbar";
const contentContainerClassName = "max-w-4xl mx-auto p-10";

export function KnowledgeDetails({
  selectedArticle,
  history,
  currentManager,
  isCreatingArticle,
  actions,
}: KnowledgeDetailsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRefreshPending, startRefreshTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(isCreatingArticle);
  const [showHistory, setShowHistory] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const {
    title,
    content,
    slug,
    status,
    setTitle,
    setContent,
    setSlug,
    setStatus,
    resetToSelectedArticle,
  } = useKnowledgeArticleDraft(selectedArticle);
  const { toast, showToast, closeToast } = useToastState<"success" | "error">();

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

  const canEdit = !!currentManager;
  const canCreateArticle = !!currentManager;
  const canManageLifecycle = isPrivilegedManager(currentManager);

  const displayedArticle = selectedArticle
    ? {
        ...selectedArticle,
        embeddingStatus: manualEmbeddingStatus ?? selectedArticle.embeddingStatus,
      }
    : null;
  const canRefreshEmbeddings =
    canManageLifecycle &&
    !!displayedArticle &&
    displayedArticle.status === "published" &&
    !isEditing &&
    !showHistory &&
    (displayedArticle.embeddingStatus === "outdated" ||
      displayedArticle.embeddingStatus === "failed");

  const handleSave = () => {
    startTransition(async () => {
      const result = await actions.upsertArticle(
        selectedArticle?.id ?? null,
        title,
        content,
        slug,
        status,
        selectedArticle?.version
      );

      if (result.error) {
        showToast(result.error, "error");
        return;
      }

      setIsEditing(false);
      showToast("Статья сохранена.", "success");

      const savedArticleId = result.data?.id ?? selectedArticle?.id ?? null;
      const savedArticleStatus = result.data?.status ?? status;

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

  const handleStatusChange = (newStatus: ArticleStatus) => {
    if (!selectedArticle) {
      return;
    }

    startTransition(async () => {
      const result = await actions.setArticleStatus(
        selectedArticle.id,
        newStatus,
        selectedArticle.version
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

  const handleDelete = () => {
    if (!selectedArticle) {
      return;
    }

    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (!selectedArticle) {
      return;
    }

    startTransition(async () => {
      const result = await actions.deleteArticle(selectedArticle.id, selectedArticle.version);

      if (result.error) {
        showToast(result.error, "error");
        return;
      }

      setIsDeleteConfirmOpen(false);
      showToast("Статья удалена.", "success");
      router.push("/knowledge-base?view=archive");
      router.refresh();
    });
  };

  const handleRefreshEmbeddings = () => {
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

  const handleToggleHistory = () => {
    setShowHistory((currentValue) => !currentValue);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    if (selectedArticle) {
      setIsEditing(false);
      resetToSelectedArticle();
      return;
    }

    router.push("/knowledge-base");
  };

  if (!selectedArticle && (!isEditing || !canCreateArticle)) {
    return (
      <EmptyState
        className={emptyStateClassName}
        title="Откройте статью, чтобы прочитать"
        description="Выберите материал из списка слева."
      />
    );
  }

  return (
    <div className={detailsPanelClassName}>
      <KnowledgeDetailsHeader
        article={displayedArticle}
        title={title}
        isEditing={isEditing}
        showHistory={showHistory}
        canEdit={canEdit}
        canManageLifecycle={canManageLifecycle}
        canRefreshEmbeddings={canRefreshEmbeddings}
        isPending={isPending}
        isRefreshPending={isRefreshPending}
        onTitleChange={setTitle}
        onToggleHistory={handleToggleHistory}
        onStartEdit={() => setIsEditing(true)}
        onCancelEdit={handleCancelEdit}
        onSave={handleSave}
        onRefreshEmbeddings={handleRefreshEmbeddings}
      />

      <div className={contentScrollClassName}>
        <div className={contentContainerClassName}>
          {showHistory ? (
            <KnowledgeArticleHistoryList history={history} />
          ) : isEditing ? (
            <KnowledgeArticleForm
              slug={slug}
              status={status}
              content={content}
              onSlugChange={setSlug}
              onStatusChange={setStatus}
              onContentChange={setContent}
            />
          ) : displayedArticle ? (
            <KnowledgeArticleView
              article={displayedArticle}
              canManageLifecycle={canManageLifecycle}
              isPending={isPending}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
            />
          ) : null}
        </div>
      </div>

      {toast ? (
        <Toast
          key={toast.id}
          message={toast.message}
          variant={toast.variant}
          onClose={() => closeToast(toast.id)}
        />
      ) : null}
      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        title="Удалить статью"
        description={
          selectedArticle
            ? `Удалить статью "${selectedArticle.title}" навсегда?\n\nБудет удалена сама статья и вся история изменений.\nЭто действие необратимо.`
            : ""
        }
        confirmLabel="Удалить"
        variant="danger"
        isPending={isPending}
        onCancel={() => setIsDeleteConfirmOpen(false)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
