import { Badge } from "@/shared/ui/badge";
import type { KnowledgeArticleHistory } from "@/entities/knowledge-article";

type KnowledgeArticleHistoryListProps = {
  history: KnowledgeArticleHistory[];
};

const historyTitleClassName =
  "text-sm font-black uppercase tracking-widest support-text-muted border-b border-black/5 pb-4";
const historyCardClassName =
  "p-5 rounded-[2rem] bg-white/40 border border-black/5 hover:bg-white transition-all shadow-sm";
const historyDateClassName = "text-[10px] support-text-muted font-bold";
const historyItemTitleClassName = "text-sm font-bold support-text-primary mb-1";
const historyItemContentClassName = "text-xs support-text-secondary line-clamp-2 leading-relaxed";

export function KnowledgeArticleHistoryList({ history }: KnowledgeArticleHistoryListProps) {
  return (
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
                  {new Date(item.changedAt).toLocaleString("ru-RU")}
                </span>
              </div>
              <p className={historyItemTitleClassName}>{item.title}</p>
              <p className={historyItemContentClassName}>{item.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
