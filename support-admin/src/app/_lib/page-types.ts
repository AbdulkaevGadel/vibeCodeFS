import type { SupportChatBotOption, SupportChatInboxPageInfo, SupportChatSummary } from "@/entities/support-chat";
import type { ChatMessage as SupportChatMessage } from "@/entities/chat-message";
import type { Manager } from "@/entities/manager";

// Transitional compatibility file during the FSD migration.
// Do not add new domain types here: move them to the responsible entity phase.
export type SearchParamValue = string | string[] | undefined;

export type {
  SupportChatBotOption,
  SupportChatInboxCursor,
  SupportChatInboxPage,
  SupportChatInboxPageInfo,
  SupportChatStatus,
  SupportChatSummary,
} from "@/entities/support-chat";
export type {
  ChatMessage,
  MessageDeliveryStatus,
  MessageSenderType,
} from "@/entities/chat-message";
export type { Manager, ManagerRole } from "@/entities/manager";
export {
  coerceManagerRole,
  isManagerRole,
  managerRoles,
} from "@/entities/manager";

export type PageProps = {
  searchParams?: Promise<{
    bot?: SearchParamValue;
    chat?: SearchParamValue;
    article?: SearchParamValue;
    search?: SearchParamValue;
    view?: SearchParamValue;
    mode?: SearchParamValue;
  }>;
};

export type SupportAdminPageData = {
  botOptions: SupportChatBotOption[];
  selectedBot: SupportChatBotOption | null;
  botFilteredChats: SupportChatSummary[];
  botFilteredChatCount: number;
  botFilteredMessageCount: number;
  chatSummaries: SupportChatSummary[];
  chatInboxPageInfo: SupportChatInboxPageInfo;
  selectedChat: SupportChatSummary | null;
  selectedChatMessages: SupportChatMessage[];
  allManagers: Manager[];
  currentManager: Manager | null;
  statusMessage: string | null;
  statusVariant: "success" | "error" | null;
  errorMessage: string | null;
  headerBotLabel: string;
};

export type ArticleStatus = "draft" | "published" | "archived";

export type KnowledgeBaseView = "active" | "archive";

export type ArticleEmbeddingStatus = "actual" | "outdated" | "updating" | "failed" | "unavailable";

export type KnowledgeEmbeddingSummary = {
  totalCount: number;
  publishedCount: number;
  actualCount: number;
  outdatedCount: number;
  updatingCount: number;
  failedCount: number;
  unavailableCount: number;
  refreshableCount: number;
};

export type KnowledgeEmbeddingRefreshBatchStatus = "running" | "completed" | "completed_with_errors" | "failed";

export type KnowledgeEmbeddingRefreshBatchItemStatus = "pending" | "processing" | "completed" | "failed" | "skipped";

export type KnowledgeEmbeddingRefreshBatchItem = {
  id: string;
  articleId: string;
  articleTitle: string;
  articleVersion: number;
  status: KnowledgeEmbeddingRefreshBatchItemStatus;
  resultType: string | null;
  errorMessage: string | null;
  processedAt: string | null;
};

export type KnowledgeEmbeddingRefreshBatch = {
  id: string;
  status: KnowledgeEmbeddingRefreshBatchStatus;
  totalCount: number;
  processedCount: number;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  items: KnowledgeEmbeddingRefreshBatchItem[];
};

export type KnowledgeArticle = {
  id: string;
  slug: string;
  title: string;
  content: string;
  status: ArticleStatus;
  version: number;
  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  archivedById: string | null;
  embeddingStatus: ArticleEmbeddingStatus;
  embeddingChunkSetId: string | null;
  embeddingErrorMessage: string | null;
};

export type KnowledgeArticleHistory = {
  id: string;
  articleId: string;
  title: string;
  content: string;
  version: number;
  changeType: "create" | "update" | "publish" | "unpublish" | "archive" | "restore";
  changedById: string | null;
  changedAt: string;
};
