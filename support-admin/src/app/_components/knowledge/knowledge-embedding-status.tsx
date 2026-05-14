import { TooltipMarker } from "@/shared/ui/tooltip-marker";
import { ArticleEmbeddingStatus, KnowledgeArticle } from "../../_lib/page-types";

type KnowledgeEmbeddingStatusProps = {
  article: KnowledgeArticle;
};

type EmbeddingUi = {
  icon: string;
  tooltip: string;
  buttonTitle: string;
  tone: "muted" | "success" | "warning" | "danger" | "info";
  isSpinner: boolean;
};

const unavailableEmbeddingUi: EmbeddingUi = {
  icon: "-",
  tooltip: "Embeddings недоступны для этой статьи",
  buttonTitle: "Embeddings недоступны для этой статьи",
  tone: "muted",
  isSpinner: false,
};

const draftEmbeddingUi: EmbeddingUi = {
  icon: "!",
  tooltip: "Для появления в базе ИИ опубликуйте статью",
  buttonTitle: "Для появления в базе ИИ опубликуйте статью",
  tone: "warning",
  isSpinner: false,
};

const embeddingUiByStatus: Record<ArticleEmbeddingStatus, EmbeddingUi> = {
  unavailable: unavailableEmbeddingUi,
  actual: {
    icon: "✓",
    tooltip: "Embeddings актуальны",
    buttonTitle: "Embeddings уже актуальны",
    tone: "success",
    isSpinner: false,
  },
  updating: {
    icon: "◌",
    tooltip: "Идёт обновление embeddings",
    buttonTitle: "Идёт обновление embeddings",
    tone: "info",
    isSpinner: true,
  },
  failed: {
    icon: "⚠",
    tooltip: "Последнее обновление embeddings завершилось ошибкой. Попробуйте снова",
    buttonTitle: "Повторить обновление embeddings",
    tone: "danger",
    isSpinner: false,
  },
  outdated: {
    icon: "⚠",
    tooltip: "Embeddings устарели, требуется обновление",
    buttonTitle: "Обновить embeddings для текущей версии статьи",
    tone: "warning",
    isSpinner: false,
  },
};

export function getEmbeddingUi(article: {
  status: KnowledgeArticle["status"];
  embeddingStatus: ArticleEmbeddingStatus;
}): EmbeddingUi {
  if (article.status === "draft") {
    return draftEmbeddingUi;
  }

  if (article.status === "archived") {
    return unavailableEmbeddingUi;
  }

  return embeddingUiByStatus[article.embeddingStatus];
}

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
