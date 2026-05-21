import { cookies } from "next/headers";
import { AdminHeader } from "../_components/admin-header";
import { SupportInboxPage } from "@/fsd-pages/support-inbox";
import {
  deleteChatAction,
  deleteMessageAction,
  markChatAsReadAction,
  sendManagerMessageAction,
  takeChatIntoWorkAction,
  transferChatAction,
  updateChatStatusAction,
} from "./_actions/chat-actions";
import { loadChatInboxPageAction } from "./_actions/chat-inbox-actions";
import { flashCookieName, isFlashStatus } from "../_lib/flash-cookie";
import { getSupportAdminPageData } from "../_lib/get-support-admin-page-data";
import { PageProps } from "../_lib/page-types";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const flashStatusValue = cookieStore.get(flashCookieName)?.value;
  const flashStatus = isFlashStatus(flashStatusValue) ? flashStatusValue : undefined;
  const pageData = await getSupportAdminPageData(await searchParams, flashStatus);

  return (
    <SupportInboxPage
      botOptions={pageData.botOptions}
      selectedBot={pageData.selectedBot}
      botFilteredChatCount={pageData.botFilteredChatCount}
      botFilteredMessageCount={pageData.botFilteredMessageCount}
      chatSummaries={pageData.chatSummaries}
      chatInboxPageInfo={pageData.chatInboxPageInfo}
      selectedChat={pageData.selectedChat}
      selectedChatMessages={pageData.selectedChatMessages}
      allManagers={pageData.allManagers}
      currentManager={pageData.currentManager}
      statusMessage={pageData.statusMessage}
      statusVariant={pageData.statusVariant}
      errorMessage={pageData.errorMessage}
      headerBotLabel={pageData.headerBotLabel}
      loadChatInboxPage={loadChatInboxPageAction}
      actions={{
        deleteChat: deleteChatAction,
        deleteMessage: deleteMessageAction,
        markChatAsRead: markChatAsReadAction,
        sendManagerMessage: sendManagerMessageAction,
        takeChatIntoWork: takeChatIntoWorkAction,
        transferChat: transferChatAction,
        updateChatStatus: updateChatStatusAction,
      }}
      renderHeaderShell={(headerProps) => (
        <AdminHeader
          {...headerProps}
        />
      )}
    />
  );
}
