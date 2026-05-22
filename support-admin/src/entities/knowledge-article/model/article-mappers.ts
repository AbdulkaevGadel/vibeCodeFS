import type {
  ArticleStatus,
  KnowledgeArticle,
  KnowledgeArticleHistory,
} from "./types";

type KnowledgeArticleRow = {
  id: string;
  slug: string;
  title: string;
  content: string;
  status: ArticleStatus;
  version: number;
  created_by_id: string | null;
  updated_by_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_by_id: string | null;
};

type KnowledgeArticleHistoryRow = {
  id: string;
  article_id: string;
  title: string;
  content: string;
  version: number;
  change_type: KnowledgeArticleHistory["changeType"];
  changed_by_id: string | null;
  changed_at: string;
};

export function mapKnowledgeArticle(row: KnowledgeArticleRow): KnowledgeArticle {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    content: row.content,
    status: row.status,
    version: row.version,
    createdById: row.created_by_id,
    updatedById: row.updated_by_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    archivedById: row.archived_by_id,
    embeddingStatus: "unavailable",
    embeddingChunkSetId: null,
    embeddingErrorMessage: null,
  };
}

export function mapKnowledgeArticleHistory(row: KnowledgeArticleHistoryRow): KnowledgeArticleHistory {
  return {
    id: row.id,
    articleId: row.article_id,
    title: row.title,
    content: row.content,
    version: row.version,
    changeType: row.change_type,
    changedById: row.changed_by_id,
    changedAt: row.changed_at,
  };
}
