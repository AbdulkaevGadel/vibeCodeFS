import { ChatDetails } from "@/widgets/chat-details";
import { ChatList } from "@/widgets/chat-list";
import type { SupportInboxPageProps } from "../model/types";
import { BotTabs } from "./parts/bot-tabs";
import { ChatHeaderStats } from "./parts/chat-header-stats";
import { CurrentManagerPanel } from "./parts/current-manager-panel";
import { ErrorAlert } from "./parts/error-alert";
import { StatusAlert } from "./parts/status-alert";
import styles from "./support-inbox-page.module.css";

export function SupportInboxPage({
  botOptions,
  selectedBot,
  botFilteredChatCount,
  botFilteredMessageCount,
  chatSummaries,
  chatInboxPageInfo,
  selectedChat,
  selectedChatMessages,
  allManagers,
  currentManager,
  statusMessage,
  statusVariant,
  errorMessage,
  headerBotLabel,
  actions,
  loadChatInboxPage,
  renderHeaderShell,
}: SupportInboxPageProps) {
  const selectedBotKey = selectedBot?.key ?? null;
  const selectedBotUsername = selectedBot?.value ?? null;

  return (
    <main className={styles.pageMain}>
      <div className={styles.pageContent}>
        {renderHeaderShell({
          title: headerBotLabel,
          allManagers,
          currentManager,
          navigationHref: "/knowledge-base",
          navigationLabel: "База знаний",
          stats: (
            <ChatHeaderStats
              botLabel={headerBotLabel}
              messageCount={botFilteredMessageCount}
              chatCount={botFilteredChatCount}
            />
          ),
          sidePanel: currentManager ? (
            <CurrentManagerPanel manager={currentManager} />
          ) : null,
          bottom: (
            <BotTabs
              botOptions={botOptions}
              selectedBotKey={selectedBotKey}
            />
          ),
        })}

        {statusMessage && statusVariant ? (
          <StatusAlert
            message={statusMessage}
            variant={statusVariant}
          />
        ) : null}

        {errorMessage ? (
          <ErrorAlert message={errorMessage} />
        ) : (
          <section className={styles.pageGrid}>
            <ChatList
              chatSummaries={chatSummaries}
              chatInboxPageInfo={chatInboxPageInfo}
              selectedChat={selectedChat}
              selectedChatId={selectedChat?.id ?? null}
              selectedBotKey={selectedBotKey}
              selectedBotUsername={selectedBotUsername}
              loadChatInboxPage={loadChatInboxPage}
            />
            <ChatDetails
              selectedChat={selectedChat}
              selectedChatMessages={selectedChatMessages}
              selectedBotKey={selectedBotKey}
              allManagers={allManagers}
              currentManager={currentManager}
              actions={actions}
            />
          </section>
        )}
      </div>
    </main>
  );
}
