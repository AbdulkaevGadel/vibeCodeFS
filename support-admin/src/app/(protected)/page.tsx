import { cookies } from "next/headers";
import { deleteChatAction } from "@/features/delete-chat";
import { deleteMessageAction } from "@/features/delete-message";
import { loadChatInboxPageAction } from "@/features/load-chat-inbox-page";
import { markChatAsReadAction } from "@/features/mark-chat-as-read";
import { sendManagerMessageAction } from "@/features/send-message";
import { SupportInboxPage } from "@/fsd-pages/support-inbox";
import { logoutAction } from "@/features/auth/logout/actions";
import { takeChatIntoWorkAction } from "@/features/take-chat-into-work";
import { transferChatAction } from "@/features/transfer-chat";
import { updateChatStatusAction } from "@/features/update-chat-status";
import { AdminHeader } from "@/widgets/admin-header";
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
          logoutAction={logoutAction}
        />
      )}
    />
  );
}
