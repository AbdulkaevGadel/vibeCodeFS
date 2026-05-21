import type { ReactNode } from "react";
import type { ChatMessage } from "@/entities/chat-message";
import type { Manager } from "@/entities/manager";
import type {
  SupportChatBotOption,
  SupportChatInboxPageInfo,
  SupportChatSummary,
} from "@/entities/support-chat";
import type { ChatDetailsActions } from "@/widgets/chat-details";
import type { LoadChatInboxPage } from "@/widgets/chat-list";

export type SupportInboxHeaderShellProps = {
  title: string;
  allManagers: Manager[];
  currentManager: Manager | null;
  navigationHref: string;
  navigationLabel: string;
  stats: ReactNode;
  sidePanel: ReactNode;
  bottom: ReactNode;
};

export type SupportInboxPageProps = {
  botOptions: SupportChatBotOption[];
  selectedBot: SupportChatBotOption | null;
  botFilteredChatCount: number;
  botFilteredMessageCount: number;
  chatSummaries: SupportChatSummary[];
  chatInboxPageInfo: SupportChatInboxPageInfo;
  selectedChat: SupportChatSummary | null;
  selectedChatMessages: ChatMessage[];
  allManagers: Manager[];
  currentManager: Manager | null;
  statusMessage: string | null;
  statusVariant: "success" | "error" | null;
  errorMessage: string | null;
  headerBotLabel: string;
  actions: ChatDetailsActions;
  loadChatInboxPage: LoadChatInboxPage;
  renderHeaderShell: (props: SupportInboxHeaderShellProps) => ReactNode;
};
