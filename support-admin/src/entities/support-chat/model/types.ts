export type SupportChatStatus = "open" | "waiting_operator" | "in_progress" | "escalated" | "resolved" | "closed";

export type SupportChatBotOption = {
  key: string;
  label: string;
  value: string | null;
};

export type SupportChatSummary = {
  id: string;
  telegramChatId: number;
  botUsername: string;
  status: SupportChatStatus;
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

export type SupportChatInboxCursor = {
  lastMessageAt: string | null;
  createdAt: string;
  chatId: string;
};

export type SupportChatInboxPageInfo = {
  hasMore: boolean;
  nextCursor: SupportChatInboxCursor | null;
};

export type SupportChatInboxPage = {
  rows: SupportChatSummary[];
  pageInfo: SupportChatInboxPageInfo;
};
