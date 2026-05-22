import { Button } from "@/shared/ui/button";

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
