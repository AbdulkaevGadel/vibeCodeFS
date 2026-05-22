import { TooltipMarker } from "@/shared/ui/tooltip-marker";
import type { KnowledgeArticle } from "@/entities/knowledge-article";
import { getEmbeddingUi } from "./knowledge-embedding-status-utils";

type KnowledgeEmbeddingStatusProps = {
  article: KnowledgeArticle;
};

export function KnowledgeEmbeddingStatus({ article }: KnowledgeEmbeddingStatusProps) {
  const embeddingUi = getEmbeddingUi(article);

  return (
    <TooltipMarker
      content={embeddingUi.tooltip}
      label={embeddingUi.icon}
      size="md"
      tone={embeddingUi.tone}
      labelClassName={embeddingUi.isSpinner ? "animate-spin" : ""}
    />
  );
}
