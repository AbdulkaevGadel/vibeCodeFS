import type { KnowledgeEmbeddingRefreshBatch } from "@/entities/knowledge-article";

type ActionResult<TData = unknown> = Promise<{
  data?: TData | null;
  error?: string;
  message?: string;
}>;

export type KnowledgeEmbeddingRefreshPanelActions = {
  getBatchState: () => ActionResult<KnowledgeEmbeddingRefreshBatch | null>;
  startBatch: () => ActionResult<KnowledgeEmbeddingRefreshBatch | null>;
};
