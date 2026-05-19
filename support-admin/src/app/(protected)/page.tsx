import { cookies } from "next/headers";
import { AdminHeader } from "../_components/admin-header";
import {
  ChatHeaderStats,
  ChatHeaderTabs,
  CurrentManagerPanel,
} from "../_components/chat-header-content";
import { ChatDetails } from "@/widgets/chat-details";
import { ChatList } from "@/widgets/chat-list";
import { ErrorAlert } from "../_components/error-alert";
import { StatusAlert } from "../_components/status-alert";
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
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const flashStatusValue = cookieStore.get(flashCookieName)?.value;
  const flashStatus = isFlashStatus(flashStatusValue) ? flashStatusValue : undefined;
  const pageData = await getSupportAdminPageData(await searchParams, flashStatus);

  return (
    <main className={styles.pageMain}>
      <div className={styles.pageContent}>
        <AdminHeader
          title={pageData.headerBotLabel}
          allManagers={pageData.allManagers}
          currentManager={pageData.currentManager}
          navigationHref="/knowledge-base"
          navigationLabel="База знаний"
          stats={(
            <ChatHeaderStats
              botLabel={pageData.headerBotLabel}
              messageCount={pageData.botFilteredMessageCount}
              chatCount={pageData.botFilteredChatCount}
            />
          )}
          sidePanel={pageData.currentManager ? (
            <CurrentManagerPanel manager={pageData.currentManager} />
          ) : null}
          bottom={(
            <ChatHeaderTabs
              botOptions={pageData.botOptions}
              selectedBotKey={pageData.selectedBot?.key ?? null}
            />
          )}
        />

        {pageData.statusMessage && pageData.statusVariant ? (
          <StatusAlert
            message={pageData.statusMessage}
            variant={pageData.statusVariant}
          />
        ) : null}

        {pageData.errorMessage ? (
          <ErrorAlert message={pageData.errorMessage} />
        ) : (
          <section className={styles.pageGrid}>
            <ChatList
              chatSummaries={pageData.chatSummaries}
              chatInboxPageInfo={pageData.chatInboxPageInfo}
              selectedChat={pageData.selectedChat}
              selectedChatId={pageData.selectedChat?.id ?? null}
              selectedBotKey={pageData.selectedBot?.key ?? null}
              selectedBotUsername={pageData.selectedBot?.value ?? null}
              loadChatInboxPage={loadChatInboxPageAction}
            />
            <ChatDetails
              selectedChat={pageData.selectedChat}
              selectedChatMessages={pageData.selectedChatMessages}
              selectedBotKey={pageData.selectedBot?.key ?? null}
              allManagers={pageData.allManagers}
              currentManager={pageData.currentManager}
              actions={{
                deleteChat: deleteChatAction,
                deleteMessage: deleteMessageAction,
                markChatAsRead: markChatAsReadAction,
                sendManagerMessage: sendManagerMessageAction,
                takeChatIntoWork: takeChatIntoWorkAction,
                transferChat: transferChatAction,
                updateChatStatus: updateChatStatusAction,
              }}
            />
          </section>
        )}
      </div>
    </main>
  );
}
