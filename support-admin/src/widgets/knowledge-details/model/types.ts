import type { ArticleStatus, KnowledgeArticle } from "@/entities/knowledge-article";

type ActionResult<TData = unknown> = Promise<{
  data?: TData | null;
  error?: string;
  message?: string;
}>;

export type KnowledgeDetailsActions = {
  upsertArticle: (
    id: string | null,
    title: string,
    content: string,
    slug: string,
    status: ArticleStatus,
    expectedVersion?: number,
  ) => ActionResult<{ id?: string; status?: ArticleStatus }>;
  setArticleStatus: (
    id: string,
    status: ArticleStatus,
    expectedVersion: number,
  ) => ActionResult;
  deleteArticle: (id: string, expectedVersion: number) => ActionResult;
  refreshArticleEmbeddings: (
    id: string,
    expectedVersion: number,
  ) => ActionResult<{ type?: string }>;
  getArticleEmbeddingState: (
    id: string,
  ) => ActionResult<Pick<KnowledgeArticle, "embeddingStatus" | "embeddingChunkSetId" | "embeddingErrorMessage">>;
};
