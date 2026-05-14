"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { Toast, useToastState } from "@/shared/ui/toast";
import {
  upsertArticleAction,
  setArticleStatusAction,
  deleteArticleAction,
  refreshArticleEmbeddingsAction,
  getArticleEmbeddingStateAction,
} from "../../(protected)/_actions/knowledge-actions";
import {
  ArticleStatus,
  KnowledgeArticle,
  KnowledgeArticleHistory,
  Manager,
} from "../../_lib/page-types";
import { KnowledgeArticleForm } from "./knowledge-article-form";
import { KnowledgeArticleHistoryList } from "./knowledge-article-history";
import { KnowledgeArticleView } from "./knowledge-article-view";
import { KnowledgeDetailsHeader } from "./knowledge-details-header";
import { useArticleEmbeddingSync } from "./use-article-embedding-sync";

type KnowledgeDetailsProps = {
  selectedArticle: KnowledgeArticle | null;
  history: KnowledgeArticleHistory[];
  currentManager: Manager | null;
  isCreatingArticle: boolean;
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
}: KnowledgeDetailsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRefreshPending, startRefreshTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(isCreatingArticle);
  const [showHistory, setShowHistory] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const [title, setTitle] = useState(selectedArticle?.title ?? "");
  const [content, setContent] = useState(selectedArticle?.content ?? "");
  const [slug, setSlug] = useState(selectedArticle?.slug ?? "");
  const [status, setStatus] = useState<ArticleStatus>(selectedArticle?.status ?? "draft");
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
    onTerminalState: handleEmbeddingTerminalState,
  });

  const canEdit = !!currentManager;
  const canCreateArticle = !!currentManager;
  const canManageLifecycle = currentManager?.role === "admin" || currentManager?.role === "supervisor";

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
      const result = await upsertArticleAction(
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
        const embeddingStateResult = await getArticleEmbeddingStateAction(savedArticleId);

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
      const result = await setArticleStatusAction(
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
      const result = await deleteArticleAction(selectedArticle.id, selectedArticle.version);

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
      const result = await refreshArticleEmbeddingsAction(selectedArticle.id, selectedArticle.version);

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
      setTitle(selectedArticle.title);
      setContent(selectedArticle.content);
      setSlug(selectedArticle.slug);
      setStatus(selectedArticle.status);
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
