import type { KnowledgeEmbeddingRefreshBatch } from "@/entities/knowledge-article";

const kbBatchProgressClassName = "mt-3 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs";
const kbBatchProgressHeaderClassName = "flex items-center justify-between gap-3";
const kbBatchProgressTextClassName = "support-text-primary font-semibold";
const kbBatchProgressMetaClassName = "support-text-muted";
const kbBatchProgressTrackClassName = "mt-2 h-2 overflow-hidden rounded-full bg-slate-100";
const kbBatchProgressFillClassName = "h-full rounded-full bg-slate-950 transition-all";
const kbBatchFooterClassName = "mt-3 flex flex-wrap items-center justify-between gap-2";

type KnowledgeBatchProgressProps = {
  batch: KnowledgeEmbeddingRefreshBatch;
  visibleLogCount: number;
};

function getBatchStatusLabel(status: KnowledgeEmbeddingRefreshBatch["status"]) {
  switch (status) {
    case "completed":
      return "Готово";
    case "completed_with_errors":
      return "Готово с ошибками";
    case "failed":
      return "Ошибка";
    case "running":
      return "В работе";
  }
}

export function KnowledgeBatchProgress({
  batch,
  visibleLogCount,
}: KnowledgeBatchProgressProps) {
  const progressPercent = batch.totalCount > 0
    ? Math.round((batch.processedCount / batch.totalCount) * 100)
    : 0;

  return (
    <div className={kbBatchProgressClassName}>
      <div className={kbBatchProgressHeaderClassName}>
        <span className={kbBatchProgressTextClassName}>
          Обработано {batch.processedCount} из {batch.totalCount}
        </span>
        <span className={kbBatchProgressMetaClassName}>
          {getBatchStatusLabel(batch.status)}
        </span>
      </div>
      <div className={kbBatchProgressTrackClassName}>
        <div
          className={kbBatchProgressFillClassName}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <p className={kbBatchProgressMetaClassName}>
        Успешно: {batch.completedCount} · Ошибок: {batch.failedCount} · Пропущено: {batch.skippedCount}
      </p>

      {visibleLogCount > 0 ? (
        <div className={kbBatchFooterClassName}>
          <span className={kbBatchProgressMetaClassName}>
            Ошибок и пропусков в логе: {visibleLogCount}
          </span>
        </div>
      ) : null}
    </div>
  );
}
