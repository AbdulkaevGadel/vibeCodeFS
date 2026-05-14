import { Button } from "@/shared/ui/button";

const kbStatsGridClassName = "grid gap-3 sm:grid-cols-2";
const lightStatCardClassName = "support-surface-default rounded-2xl px-4 py-3";
const statLabelClassName = "support-text-muted text-xs uppercase tracking-[0.24em]";
const statValueClassName = "support-text-primary mt-2 text-2xl font-semibold";

type KnowledgeHeaderStatsProps = {
  totalCount: number;
  publishedCount: number;
};

export function KnowledgeHeaderStats({
  totalCount,
  publishedCount,
}: KnowledgeHeaderStatsProps) {
  return (
    <div className={kbStatsGridClassName}>
      <div className={lightStatCardClassName}>
        <p className={statLabelClassName}>Всего статей</p>
        <p className={statValueClassName}>{totalCount}</p>
      </div>
      <div className={lightStatCardClassName}>
        <p className={statLabelClassName}>Опубликовано</p>
        <p className={statValueClassName}>{publishedCount}</p>
      </div>
    </div>
  );
}

type KnowledgeArchiveActionProps = {
  isArchiveView: boolean;
};

export function KnowledgeArchiveAction({ isArchiveView }: KnowledgeArchiveActionProps) {
  return (
    <Button
      href={isArchiveView ? "/knowledge-base" : "/knowledge-base?view=archive"}
      variant="secondary"
      active={isArchiveView}
      size="sm"
    >
      {isArchiveView ? "Активные статьи" : "Архив"}
    </Button>
  );
}
