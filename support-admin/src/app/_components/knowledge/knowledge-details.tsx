"use client";

import { useState, useTransition } from "react";
import { KnowledgeArticle, KnowledgeArticleHistory, Manager } from "../../_lib/page-types";
import {
  upsertArticleAction,
  setArticleStatusAction,
  deleteArticleAction,
  refreshArticleEmbeddingsAction,
} from "../../(protected)/_actions/knowledge-actions";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { Toast, useToastState } from "@/shared/ui/toast";

type KnowledgeDetailsProps = {
  selectedArticle: KnowledgeArticle | null;
  history: KnowledgeArticleHistory[];
  currentManager: Manager | null;
  isCreatingArticle: boolean;
};

const emptyStateClassName = "h-[calc(100vh-200px)]";
const detailsPanelClassName = "flex flex-col h-[calc(100vh-200px)] overflow-hidden support-panel";
const headerClassName = "flex items-center justify-between p-6 border-b border-black/5 bg-white/20";
const titleInputClassName =
  "w-full bg-transparent text-2xl font-bold support-text-primary outline-none border-b border-black/10 focus:border-indigo-500 transition-colors";
const titleClassName = "text-2xl font-bold support-text-primary truncate";
const actionsClassName = "flex items-center gap-3 ml-6";
const embeddingBadgeBaseClassName =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-black";
const contentScrollClassName = "flex-1 overflow-y-auto custom-scrollbar";
const contentContainerClassName = "max-w-4xl mx-auto p-10";
const historyTitleClassName =
  "text-sm font-black uppercase tracking-widest support-text-muted border-b border-black/5 pb-4";
const historyCardClassName =
  "p-5 rounded-[2rem] bg-white/40 border border-black/5 hover:bg-white transition-all shadow-sm";
const historyDateClassName = "text-[10px] support-text-muted font-bold";
const historyItemTitleClassName = "text-sm font-bold support-text-primary mb-1";
const historyItemContentClassName = "text-xs support-text-secondary line-clamp-2 leading-relaxed";
const editFormClassName = "space-y-8 animate-in fade-in duration-500";
const editGridClassName = "grid grid-cols-2 gap-8";
const fieldWrapperClassName = "space-y-3";
const fieldLabelClassName = "text-[10px] font-black support-text-muted uppercase tracking-widest";
const fieldInputClassName =
  "w-full bg-white/50 border border-black/10 rounded-2xl px-5 py-3 text-sm support-text-primary outline-none focus:border-indigo-500 transition-all shadow-inner";
const selectInputClassName =
  "w-full bg-white/50 border border-black/10 rounded-2xl px-5 py-3 text-sm support-text-primary outline-none focus:border-indigo-500 transition-all appearance-none cursor-pointer shadow-inner";
const selectArrowClassName =
  "absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none support-text-muted";
const textareaClassName =
  "w-full bg-white/50 border border-black/10 rounded-[2.5rem] px-6 py-6 text-sm support-text-primary outline-none focus:border-indigo-500 transition-all leading-relaxed min-h-[500px] shadow-inner";
const articleViewClassName = "animate-in fade-in slide-in-from-bottom-4 duration-700";
const articleMetaClassName = "flex items-center gap-4 mb-10";
const updatedAtClassName = "text-[10px] uppercase tracking-widest support-text-muted font-bold";
const articleContentClassName =
  "whitespace-pre-wrap text-[17px] leading-[1.8] support-text-primary font-medium tracking-tight";
const lifecycleActionsClassName = "mt-16 pt-10 border-t border-black/5 flex flex-wrap justify-end gap-3";

function getEmbeddingBadgeClassName(className: string) {
  return `${embeddingBadgeBaseClassName} ${className}`;
}

export function KnowledgeDetails({ selectedArticle, history, currentManager, isCreatingArticle }: KnowledgeDetailsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRefreshPending, startRefreshTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(isCreatingArticle);
  const [showHistory, setShowHistory] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  
  // Форма
  const [title, setTitle] = useState(selectedArticle?.title ?? "");
  const [content, setContent] = useState(selectedArticle?.content ?? "");
  const [slug, setSlug] = useState(selectedArticle?.slug ?? "");
  const [status, setStatus] = useState(selectedArticle?.status ?? "draft");
  const { toast, showToast, closeToast } = useToastState<"success" | "error">();

  const canEdit = !!currentManager;
  const canCreateArticle = !!currentManager;
  const canManageLifecycle = currentManager?.role === "admin" || currentManager?.role === "supervisor";

  const handleSave = async () => {
    startTransition(async () => {
      const result = await upsertArticleAction(
        selectedArticle?.id ?? null,
        title,
        content,
        slug,
        status as any,
        selectedArticle?.version
      );

      if (result.error) {
        showToast(result.error, "error");
      } else {
        setIsEditing(false);
        showToast("Статья сохранена.", "success");
        if (!selectedArticle && result.data) {
           router.push(`/knowledge-base?article=${result.data.id}`);
        }
      }
    });
  };

  const handleStatusChange = async (newStatus: any) => {
    if (!selectedArticle) return;
    startTransition(async () => {
      const result = await setArticleStatusAction(selectedArticle.id, newStatus, selectedArticle.version);
      if (result.error) {
        showToast(result.error, "error");
      } else if (result.data) {
        showToast("Статус статьи изменён.", "success");
        if (newStatus === "archived") {
          router.push("/knowledge-base");
        } else {
          router.push("/knowledge-base?view=archive");
        }
        router.refresh();
      }
    });
  };

  const handleDelete = async () => {
    if (!selectedArticle) return;
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedArticle) return;

    startTransition(async () => {
      const result = await deleteArticleAction(selectedArticle.id, selectedArticle.version);

      if (result.error) {
        showToast(result.error, "error");
      } else {
        setIsDeleteConfirmOpen(false);
        showToast("Статья удалена.", "success");
        router.push("/knowledge-base?view=archive");
        router.refresh();
      }
    });
  };

  const handleRefreshEmbeddings = async () => {
    if (!selectedArticle) return;

    startRefreshTransition(async () => {
      const result = await refreshArticleEmbeddingsAction(selectedArticle.id, selectedArticle.version);

      if (result.error) {
        showToast(result.error, "error");
      } else {
        showToast(result.message ?? "Обновление знаний ИИ запущено", "success");
        router.refresh();
      }
    });
  };

  const embeddingUi = selectedArticle ? getEmbeddingUi(selectedArticle) : null;
  const canRefreshEmbeddings = canManageLifecycle
    && !!selectedArticle
    && !isEditing
    && !showHistory
    && (selectedArticle.embeddingStatus === "outdated" || selectedArticle.embeddingStatus === "failed");

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
      {/* Header */}
      <div className={headerClassName}>
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Заголовок статьи..."
              className={titleInputClassName}
            />
          ) : (
            <h2 className={titleClassName}>{selectedArticle?.title}</h2>
          )}
        </div>
        
        <div className={actionsClassName}>
           {selectedArticle && embeddingUi && !isEditing && !showHistory && (
             <span
               title={embeddingUi.tooltip}
               className={getEmbeddingBadgeClassName(embeddingUi.className)}
             >
               <span className={embeddingUi.isSpinner ? "animate-spin" : ""}>{embeddingUi.icon}</span>
             </span>
           )}

           {selectedArticle && canManageLifecycle && !isEditing && !showHistory && (
             <Button
               onClick={handleRefreshEmbeddings}
               isLoading={isRefreshPending}
               disabled={!canRefreshEmbeddings}
               variant="secondary"
               size="sm"
               title={embeddingUi?.buttonTitle}
               className="whitespace-nowrap"
             >
               Обновить знания ИИ
             </Button>
           )}

           {selectedArticle && (
             <Button 
                onClick={() => {
                  setShowHistory(!showHistory);
                  setIsEditing(false);
                }}
                variant="secondary"
                active={showHistory}
                size="sm"
             >
               История
             </Button>
           )}

           {canEdit && !showHistory && (
             isEditing ? (
               <div className="flex items-center gap-2">
                  <Button 
                    onClick={() => {
                        if (selectedArticle) {
                            setIsEditing(false);
                            setTitle(selectedArticle.title);
                            setContent(selectedArticle.content);
                            setSlug(selectedArticle.slug);
                        } else {
                            router.push('/knowledge-base');
                        }
                    }}
                    variant="secondary"
                    size="sm"
                  >
                    Отмена
                  </Button>
                  <Button 
                    onClick={handleSave}
                    isLoading={isPending}
                    variant="secondary"
                    size="sm"
                  >
                    Сохранить
                  </Button>
               </div>
             ) : (
               <Button 
                 onClick={() => setIsEditing(true)}
                 variant="secondary"
                 size="sm"
               >
                 Редактировать
               </Button>
             )
           )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className={contentScrollClassName}>
        <div className={contentContainerClassName}>
          {showHistory ? (
            <div className="space-y-8">
               <h3 className={historyTitleClassName}>Архив изменений</h3>
               <div className="grid gap-4">
                 {history.length === 0 ? (
                   <p className="support-text-muted italic">История пуста.</p>
                 ) : (
                   history.map((item) => (
                     <div key={item.id} className={historyCardClassName}>
                        <div className="flex items-center justify-between mb-3">
                           <Badge variant="accent" size="sm" className="tracking-widest">
                             {item.changeType} v{item.version}
                           </Badge>
                           <span className={historyDateClassName}>
                             {new Date(item.changedAt).toLocaleString('ru-RU')}
                           </span>
                        </div>
                        <p className={historyItemTitleClassName}>{item.title}</p>
                        <p className={historyItemContentClassName}>{item.content}</p>
                     </div>
                   ))
                 )}
               </div>
            </div>
          ) : isEditing ? (
            <div className={editFormClassName}>
               <div className={editGridClassName}>
                <div className={fieldWrapperClassName}>
                    <label className={fieldLabelClassName}>Адрес (Slug)</label>
                    <input
                        type="text"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="my-article-url"
                        className={fieldInputClassName}
                    />
                </div>
                <div className={fieldWrapperClassName}>
                    <label className={fieldLabelClassName}>Статус</label>
                    <div className="relative">
                      <select
                          value={status}
                          onChange={(e) => setStatus(e.target.value as any)}
                          className={selectInputClassName}
                      >
                          <option value="draft">Черновик</option>
                          <option value="published">Опубликована</option>
                      </select>
                      <div className={selectArrowClassName}>
                        ▼
                      </div>
                    </div>
                </div>
               </div>

               <div className={fieldWrapperClassName}>
                 <label className={fieldLabelClassName}>Контент (Markdown)</label>
                 <textarea
                   value={content}
                   onChange={(e) => setContent(e.target.value)}
                   rows={20}
                   placeholder="Начните писать здесь..."
                   className={textareaClassName}
                 />
               </div>
            </div>
          ) : (
            <div className={articleViewClassName}>
                <div className={articleMetaClassName}>
                   <Badge variant="accent" size="md" className="rounded-2xl px-4 py-1.5 text-[10px] uppercase tracking-widest">
                      v{selectedArticle?.version}
                   </Badge>
                   <div className={updatedAtClassName}>
                      Обновлено {selectedArticle && new Date(selectedArticle.updatedAt).toLocaleDateString('ru-RU')}
                   </div>
                </div>
              
                <div className={articleContentClassName}>
                   {selectedArticle?.content}
                </div>

                {canManageLifecycle && selectedArticle && (
                  <div className={lifecycleActionsClassName}>
                     {selectedArticle.status === "archived" ? (
                       <Button 
                         onClick={handleDelete}
                         isLoading={isPending}
                         variant="danger"
                       >
                         Удалить навсегда
                       </Button>
                     ) : null}

                     <Button 
                       onClick={() => handleStatusChange(selectedArticle.status === 'archived' ? 'draft' : 'archived')}
                       isLoading={isPending}
                       variant={selectedArticle.status === 'archived' ? 'secondary' : 'danger'}
                     >
                       {selectedArticle.status === 'archived' ? "Восстановить" : "Архивировать"}
                     </Button>
                  </div>
                )}
            </div>
          )}
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

function getEmbeddingUi(article: KnowledgeArticle) {
  if (article.status === "archived" || article.embeddingStatus === "unavailable") {
    return {
      icon: "–",
      tooltip: "Embeddings недоступны для этой статьи",
      buttonTitle: "Embeddings недоступны для этой статьи",
      className: "border-slate-200 bg-slate-50 text-slate-400",
      isSpinner: false,
    };
  }

  if (article.embeddingStatus === "actual") {
    return {
      icon: "✓",
      tooltip: "Embeddings актуальны",
      buttonTitle: "Embeddings уже актуальны",
      className: "border-emerald-200 bg-emerald-50 text-emerald-600",
      isSpinner: false,
    };
  }

  if (article.embeddingStatus === "updating") {
    return {
      icon: "◌",
      tooltip: "Идёт обновление embeddings",
      buttonTitle: "Идёт обновление embeddings",
      className: "border-sky-200 bg-sky-50 text-sky-600",
      isSpinner: true,
    };
  }

  if (article.embeddingStatus === "failed") {
    return {
      icon: "⚠",
      tooltip: "Последнее обновление embeddings завершилось ошибкой. Попробуйте снова",
      buttonTitle: "Повторить обновление embeddings",
      className: "border-red-200 bg-red-50 text-red-600",
      isSpinner: false,
    };
  }

  return {
    icon: "⚠",
    tooltip: "Embeddings устарели, требуется обновление",
    buttonTitle: "Обновить embeddings для текущей версии статьи",
    className: "border-amber-200 bg-amber-50 text-amber-600",
    isSpinner: false,
  };
}
