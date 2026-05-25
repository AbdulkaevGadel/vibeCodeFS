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
