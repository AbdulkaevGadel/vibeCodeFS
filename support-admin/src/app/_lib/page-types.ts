export type SearchParamValue = string | string[] | undefined;

export type PageProps = {
  searchParams?: Promise<{
    bot?: SearchParamValue;
    chat?: SearchParamValue;
  }>;
};

export type ClientSnapshot = {
  telegramUserId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
};

export type ChatMessage = {
  id: string;
  chatId: string;
  senderType: "client" | "manager";
  managerId: string | null;
  text: string;
  deliveryStatus: "pending" | "sent" | "failed" | null;
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
  status: string;
  title: string;
  fullName: string | null;
  subtitle: string;
  username: string | null;
  assignedManagerId: string | null;
  assignedManagerName: string | null;
  telegramUserId: number;
  lastMessageAt: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  isUnread?: boolean;
};

export type Manager = {
  id: string;
  email: string | null;
  displayName: string;
  lastName: string | null;
  role: string;
};

export type SupportAdminPageData = {
  botOptions: BotOption[];
  selectedBot: BotOption | null;
  botFilteredChats: ChatSummary[];
  botFilteredMessageCount: number;
  chatSummaries: ChatSummary[];
  selectedChat: ChatSummary | null;
  selectedChatMessages: ChatMessage[];
  allManagers: Manager[];
  currentManager: Manager | null;
  statusMessage: string | null;
  statusVariant: "success" | "error" | null;
  errorMessage: string | null;
  headerBotLabel: string;
};
