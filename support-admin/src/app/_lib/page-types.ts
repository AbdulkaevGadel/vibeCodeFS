export type SearchParamValue = string | string[] | undefined;

export type PageProps = {
  searchParams?: Promise<{
    bot?: SearchParamValue;
    chat?: SearchParamValue;
  }>;
};

export type Message = {
  id: number;
  bot_username: string | null;
  chat_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  text: string | null;
  created_at: string;
};

export type BotOption = {
  key: string;
  label: string;
  value: string | null;
};

export type ChatSummary = {
  chatId: number;
  title: string;
  fullName: string | null;
  subtitle: string;
  username: string | null;
  lastMessageAt: string;
  messageCount: number;
};

export type SupportAdminPageData = {
  botOptions: BotOption[];
  selectedBot: BotOption | null;
  botFilteredMessages: Message[];
  chatSummaries: ChatSummary[];
  selectedChat: ChatSummary | null;
  selectedChatMessages: Message[];
  statusMessage: string | null;
  statusVariant: "success" | "error" | null;
  errorMessage: string | null;
  headerBotLabel: string;
};
