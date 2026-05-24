import { Modal } from "@/shared/ui/modal";
import type { KnowledgeEmbeddingRefreshBatch } from "@/entities/knowledge-article";

const kbBatchLogBodyClassName = "max-h-[520px] space-y-3 overflow-y-auto";
const kbBatchLogItemClassName = "rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800";
const kbBatchLogItemTitleClassName = "font-semibold";
const kbBatchLogItemMetaClassName = "mt-1 text-xs text-red-700/80";
const kbBatchLogEmptyClassName = "support-text-muted rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm";

type KnowledgeBatchLogModalProps = {
  items: KnowledgeEmbeddingRefreshBatch["items"];
  onClose: () => void;
};

export function KnowledgeBatchLogModal({
  items,
  onClose,
}: KnowledgeBatchLogModalProps) {
  return (
    <Modal
      isOpen
      title="Лог обновления знаний ИИ"
      description="Ошибки и пропущенные статьи последнего batch."
      onClose={onClose}
      size="md"
      bodyClassName={kbBatchLogBodyClassName}
      overlayClassName="bg-slate-950/30"
    >
      {items.length === 0 ? (
        <p className={kbBatchLogEmptyClassName}>Лог пуст.</p>
      ) : (
        items.map((item) => (
          <div key={item.id} className={kbBatchLogItemClassName}>
            <p className={kbBatchLogItemTitleClassName}>{item.articleTitle}</p>
            <p className={kbBatchLogItemMetaClassName}>
              {item.resultType ?? item.status}
              {item.errorMessage ? `: ${item.errorMessage}` : ""}
            </p>
            {item.processedAt ? (
              <p className={kbBatchLogItemMetaClassName}>
                {new Date(item.processedAt).toLocaleString("ru-RU")}
              </p>
            ) : null}
          </div>
        ))
      )}
    </Modal>
  );
}
