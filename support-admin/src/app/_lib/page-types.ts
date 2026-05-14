export type SearchParamValue = string | string[] | undefined;

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

export type ClientSnapshot = {
  telegramUserId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
};

export type MessageSenderType = "client" | "manager" | "ai" | "system";

export type ChatStatus = "open" | "waiting_operator" | "in_progress" | "escalated" | "resolved" | "closed";

export type MessageDeliveryStatus = "pending" | "sent" | "failed";

export type ManagerRole = "admin" | "support" | "supervisor";

export const managerRoles = ["admin", "support", "supervisor"] as const satisfies readonly ManagerRole[];

export function isManagerRole(value: unknown): value is ManagerRole {
  return typeof value === "string" && managerRoles.includes(value as ManagerRole);
}

export function coerceManagerRole(value: unknown): ManagerRole {
  return isManagerRole(value) ? value : "support";
}

export type ChatMessage = {
  id: string;
  chatId: string;
  senderType: MessageSenderType;
  managerId: string | null;
  text: string;
  deliveryStatus: MessageDeliveryStatus | null;
  deliveryError: string | null;
  clientMessageId: string | null;
  legacyMessageId: number | null;
  createdAt: string;
};

export type BotOption = {
  key: string;
  label: string;
  value: string | null;
};

export type ChatSummary = {
  id: string;
  telegramChatId: number;
  botUsername: string;
  status: ChatStatus;
  title: string;
  fullName: string | null;
  subtitle: string;
  username: string | null;
  assignedManagerId: string | null;
  assignedManagerName: string | null;
  telegramUserId: number;
  lastMessageAt: string | null;
  lastReadAt: string | null;
  unreadCount: number;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  isUnread?: boolean;
};

export type ChatInboxCursor = {
  lastMessageAt: string | null;
  createdAt: string;
  chatId: string;
};

export type ChatInboxPageInfo = {
  hasMore: boolean;
  nextCursor: ChatInboxCursor | null;
};

export type ChatInboxPage = {
  rows: ChatSummary[];
  pageInfo: ChatInboxPageInfo;
};

export type Manager = {
  id: string;
  email: string | null;
  displayName: string;
  lastName: string | null;
  role: ManagerRole;
};

export type SupportAdminPageData = {
  botOptions: BotOption[];
  selectedBot: BotOption | null;
  botFilteredChats: ChatSummary[];
  botFilteredChatCount: number;
  botFilteredMessageCount: number;
  chatSummaries: ChatSummary[];
  chatInboxPageInfo: ChatInboxPageInfo;
  selectedChat: ChatSummary | null;
  selectedChatMessages: ChatMessage[];
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
