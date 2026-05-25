"use client";

import type {
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
import {
  type KnowledgeDetailsActions,
  useKnowledgeDetailsActions,
  useKnowledgeDetailsMode,
} from "../model";
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
  const {
    isEditing,
    showHistory,
    isDeleteConfirmOpen,
    startEdit,
    finishEdit,
    toggleHistory,
    cancelEdit,
    openDeleteConfirm,
    closeDeleteConfirm,
  } = useKnowledgeDetailsMode({
    selectedArticle,
    isCreatingArticle,
    resetToSelectedArticle,
  });
  const {
    displayedArticle,
    isPending,
    isRefreshPending,
    saveArticle,
    changeStatus,
    deleteArticle,
    refreshEmbeddings,
    cancelCreate,
  } = useKnowledgeDetailsActions({
    selectedArticle,
    draft: {
      title,
      content,
      slug,
      status,
    },
    actions,
    finishEdit,
    closeDeleteConfirm,
    showToast,
  });

  const canEdit = !!currentManager;
  const canCreateArticle = !!currentManager;
  const canManageLifecycle = isPrivilegedManager(currentManager);
  const canRefreshEmbeddings =
    canManageLifecycle &&
    !!displayedArticle &&
    displayedArticle.status === "published" &&
    !isEditing &&
    !showHistory &&
    (displayedArticle.embeddingStatus === "outdated" ||
      displayedArticle.embeddingStatus === "failed");

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
        onToggleHistory={toggleHistory}
        onStartEdit={startEdit}
        onCancelEdit={() => cancelEdit(cancelCreate)}
        onSave={saveArticle}
        onRefreshEmbeddings={refreshEmbeddings}
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
              onDelete={openDeleteConfirm}
              onStatusChange={changeStatus}
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
        onCancel={closeDeleteConfirm}
        onConfirm={deleteArticle}
      />
    </div>
  );
}
