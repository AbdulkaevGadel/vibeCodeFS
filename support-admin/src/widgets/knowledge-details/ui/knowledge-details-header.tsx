import { Button } from "@/shared/ui/button";
import type { KnowledgeArticle } from "@/entities/knowledge-article";
import { KnowledgeEmbeddingStatus } from "./knowledge-embedding-status";
import { getEmbeddingUi } from "./knowledge-embedding-status-utils";

type KnowledgeDetailsHeaderProps = {
  article: KnowledgeArticle | null;
  title: string;
  isEditing: boolean;
  showHistory: boolean;
  canEdit: boolean;
  canManageLifecycle: boolean;
  canRefreshEmbeddings: boolean;
  isPending: boolean;
  isRefreshPending: boolean;
  onTitleChange: (value: string) => void;
  onToggleHistory: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onRefreshEmbeddings: () => void;
};

const headerClassName = "flex items-center justify-between p-6 border-b border-black/5 bg-white/20";
const titleInputClassName =
  "w-full bg-transparent text-2xl font-bold support-text-primary outline-none border-b border-black/10 focus:border-indigo-500 transition-colors";
const titleClassName = "text-2xl font-bold support-text-primary truncate";
const actionsClassName = "flex items-center gap-3 ml-6";

export function KnowledgeDetailsHeader({
  article,
  title,
  isEditing,
  showHistory,
  canEdit,
  canManageLifecycle,
  canRefreshEmbeddings,
  isPending,
  isRefreshPending,
  onTitleChange,
  onToggleHistory,
  onStartEdit,
  onCancelEdit,
  onSave,
  onRefreshEmbeddings,
}: KnowledgeDetailsHeaderProps) {
  const embeddingUi = article ? getEmbeddingUi(article) : null;

  return (
    <div className={headerClassName}>
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            type="text"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Заголовок статьи..."
            className={titleInputClassName}
          />
        ) : (
          <h2 className={titleClassName}>{article?.title}</h2>
        )}
      </div>

      <div className={actionsClassName}>
        {article && !isEditing && !showHistory ? <KnowledgeEmbeddingStatus article={article} /> : null}

        {article && article.status === "published" && canManageLifecycle && !isEditing && !showHistory ? (
          <Button
            onClick={onRefreshEmbeddings}
            isLoading={isRefreshPending}
            disabled={!canRefreshEmbeddings}
            variant="secondary"
            size="sm"
            title={embeddingUi?.buttonTitle}
            className="whitespace-nowrap"
          >
            Обновить знания ИИ
          </Button>
        ) : null}

        {article ? (
          <Button onClick={onToggleHistory} variant="secondary" active={showHistory} size="sm">
            История
          </Button>
        ) : null}

        {canEdit && !showHistory ? (
          isEditing ? (
            <div className="flex items-center gap-2">
              <Button onClick={onCancelEdit} variant="secondary" size="sm">
                Отмена
              </Button>
              <Button onClick={onSave} isLoading={isPending} variant="secondary" size="sm">
                Сохранить
              </Button>
            </div>
          ) : (
            <Button onClick={onStartEdit} variant="secondary" size="sm">
              Редактировать
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}
