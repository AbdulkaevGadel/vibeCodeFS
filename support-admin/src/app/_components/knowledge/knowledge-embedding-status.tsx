import { ArticleEmbeddingStatus, KnowledgeArticle } from "../../_lib/page-types";

type KnowledgeEmbeddingStatusProps = {
  article: KnowledgeArticle;
};

type EmbeddingUi = {
  icon: string;
  tooltip: string;
  buttonTitle: string;
  className: string;
  isSpinner: boolean;
};

const embeddingBadgeBaseClassName =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-black";

const unavailableEmbeddingUi: EmbeddingUi = {
  icon: "-",
  tooltip: "Embeddings недоступны для этой статьи",
  buttonTitle: "Embeddings недоступны для этой статьи",
  className: "border-slate-200 bg-slate-50 text-slate-400",
  isSpinner: false,
};

const draftEmbeddingUi: EmbeddingUi = {
  icon: "!",
  tooltip: "Для появления в базе ИИ опубликуйте статью",
  buttonTitle: "Для появления в базе ИИ опубликуйте статью",
  className: "border-amber-200 bg-amber-50 text-amber-600",
  isSpinner: false,
};

const embeddingUiByStatus: Record<ArticleEmbeddingStatus, EmbeddingUi> = {
  unavailable: unavailableEmbeddingUi,
  actual: {
    icon: "✓",
    tooltip: "Embeddings актуальны",
    buttonTitle: "Embeddings уже актуальны",
    className: "border-emerald-200 bg-emerald-50 text-emerald-600",
    isSpinner: false,
  },
  updating: {
    icon: "◌",
    tooltip: "Идёт обновление embeddings",
    buttonTitle: "Идёт обновление embeddings",
    className: "border-sky-200 bg-sky-50 text-sky-600",
    isSpinner: true,
  },
  failed: {
    icon: "⚠",
    tooltip: "Последнее обновление embeddings завершилось ошибкой. Попробуйте снова",
    buttonTitle: "Повторить обновление embeddings",
    className: "border-red-200 bg-red-50 text-red-600",
    isSpinner: false,
  },
  outdated: {
    icon: "⚠",
    tooltip: "Embeddings устарели, требуется обновление",
    buttonTitle: "Обновить embeddings для текущей версии статьи",
    className: "border-amber-200 bg-amber-50 text-amber-600",
    isSpinner: false,
  },
};

function getEmbeddingBadgeClassName(className: string) {
  return `${embeddingBadgeBaseClassName} ${className}`;
}

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
    <span
      title={embeddingUi.tooltip}
      className={getEmbeddingBadgeClassName(embeddingUi.className)}
    >
      <span className={embeddingUi.isSpinner ? "animate-spin" : ""}>{embeddingUi.icon}</span>
    </span>
  );
}
