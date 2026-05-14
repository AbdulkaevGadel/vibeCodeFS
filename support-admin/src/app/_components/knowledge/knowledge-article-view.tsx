import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { ArticleStatus, KnowledgeArticle } from "../../_lib/page-types";

type KnowledgeArticleViewProps = {
  article: KnowledgeArticle;
  canManageLifecycle: boolean;
  isPending: boolean;
  onDelete: () => void;
  onStatusChange: (status: ArticleStatus) => void;
};

const articleViewClassName = "animate-in fade-in slide-in-from-bottom-4 duration-700";
const articleMetaClassName = "flex items-center gap-4 mb-10";
const updatedAtClassName = "text-[10px] uppercase tracking-widest support-text-muted font-bold";
const articleContentClassName =
  "whitespace-pre-wrap text-[17px] leading-[1.8] support-text-primary font-medium tracking-tight";
const lifecycleActionsClassName = "mt-16 pt-10 border-t border-black/5 flex flex-wrap justify-end gap-3";

export function KnowledgeArticleView({
  article,
  canManageLifecycle,
  isPending,
  onDelete,
  onStatusChange,
}: KnowledgeArticleViewProps) {
  const isArchived = article.status === "archived";

  return (
    <div className={articleViewClassName}>
      <div className={articleMetaClassName}>
        <Badge
          variant="accent"
          size="md"
          className="rounded-2xl px-4 py-1.5 text-[10px] uppercase tracking-widest"
        >
          v{article.version}
        </Badge>
        <div className={updatedAtClassName}>
          Обновлено {new Date(article.updatedAt).toLocaleDateString("ru-RU")}
        </div>
      </div>

      <div className={articleContentClassName}>{article.content}</div>

      {canManageLifecycle ? (
        <div className={lifecycleActionsClassName}>
          {isArchived ? (
            <Button onClick={onDelete} isLoading={isPending} variant="danger">
              Удалить навсегда
            </Button>
          ) : null}

          <Button
            onClick={() => onStatusChange(isArchived ? "draft" : "archived")}
            isLoading={isPending}
            variant={isArchived ? "secondary" : "danger"}
          >
            {isArchived ? "Восстановить" : "Архивировать"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
