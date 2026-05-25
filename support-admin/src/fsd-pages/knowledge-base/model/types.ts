import type { ReactNode } from "react";
import type {
  KnowledgeArticle,
  KnowledgeArticleHistory,
  KnowledgeBaseView,
  KnowledgeEmbeddingRefreshBatch,
  KnowledgeEmbeddingSummary,
} from "@/entities/knowledge-article";
import type { Manager } from "@/entities/manager";
import type { KnowledgeDetailsActions } from "@/widgets/knowledge-details";
import type { KnowledgeEmbeddingRefreshPanelActions } from "@/widgets/knowledge-embedding-refresh-panel";

export type KnowledgeBaseHeaderShellProps = {
  title: string;
  allManagers: Manager[];
  currentManager: Manager | null;
  navigationHref: string;
  navigationLabel: string;
  secondaryActions: ReactNode;
  stats: ReactNode;
  sidePanel: ReactNode;
};

export type KnowledgeBasePageProps = {
  articles: KnowledgeArticle[];
  selectedArticle: KnowledgeArticle | null;
  selectedArticleId: string | null;
  history: KnowledgeArticleHistory[];
  currentManager: Manager | null;
  allManagers: Manager[];
  view: KnowledgeBaseView;
  searchQuery: string;
  isCreatingArticle: boolean;
  embeddingSummary: KnowledgeEmbeddingSummary;
  embeddingRefreshBatch: KnowledgeEmbeddingRefreshBatch | null;
  errorMessage: string | null;
  knowledgeDetailsActions: KnowledgeDetailsActions;
  embeddingRefreshPanelActions: KnowledgeEmbeddingRefreshPanelActions;
  renderHeaderShell: (props: KnowledgeBaseHeaderShellProps) => ReactNode;
};
