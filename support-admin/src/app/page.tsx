import { cookies } from "next/headers";
import { AdminHeader } from "./_components/admin-header";
import { ChatDetails } from "./_components/chat-details";
import { ChatList } from "./_components/chat-list";
import { ErrorAlert } from "./_components/error-alert";
import { StatusAlert } from "./_components/status-alert";
import { flashCookieName, isFlashStatus } from "./_lib/flash-cookie";
import { getSupportAdminPageData } from "./_lib/get-support-admin-page-data";
import { PageProps } from "./_lib/page-types";
import styles from "./page.module.css";

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
          headerBotLabel={pageData.headerBotLabel}
          messageCount={pageData.botFilteredMessages.length}
          chatCount={pageData.chatSummaries.length}
          botOptions={pageData.botOptions}
          selectedBotKey={pageData.selectedBot?.key ?? null}
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
              selectedChatId={pageData.selectedChat?.chatId ?? null}
              selectedBotKey={pageData.selectedBot?.key ?? null}
            />
            <ChatDetails
              selectedChat={pageData.selectedChat}
              selectedChatMessages={pageData.selectedChatMessages}
              selectedBotKey={pageData.selectedBot?.key ?? null}
            />
          </section>
        )}
      </div>
    </main>
  );
}
