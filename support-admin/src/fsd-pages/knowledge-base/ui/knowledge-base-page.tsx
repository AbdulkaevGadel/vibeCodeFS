import { isPrivilegedManager } from "@/entities/manager";
import { KnowledgeDetails } from "@/widgets/knowledge-details";
import {
  KnowledgeArchiveAction,
  KnowledgeEmbeddingRefreshPanel,
  KnowledgeHeaderStats,
} from "@/widgets/knowledge-embedding-refresh-panel";
import { KnowledgeList } from "@/widgets/knowledge-list";
import type { KnowledgeBasePageProps } from "../model/types";
import { ErrorAlert } from "./parts/error-alert";
import styles from "./knowledge-base-page.module.css";

export function KnowledgeBasePage({
  articles,
  selectedArticle,
  selectedArticleId,
  history,
  currentManager,
  allManagers,
  view,
  searchQuery,
  isCreatingArticle,
  embeddingSummary,
  embeddingRefreshBatch,
  errorMessage,
  knowledgeDetailsActions,
  embeddingRefreshPanelActions,
  renderHeaderShell,
}: KnowledgeBasePageProps) {
  const canManageKnowledgeArchive = isPrivilegedManager(currentManager);

  return (
    <main className={styles.pageMain}>
      <div className={styles.pageContent}>
        {renderHeaderShell({
          title: "База знаний",
          allManagers,
          currentManager,
          navigationHref: "/",
          navigationLabel: "← Вернуться к чатам",
          secondaryActions: canManageKnowledgeArchive ? (
            <KnowledgeArchiveAction isArchiveView={view === "archive"} />
          ) : null,
          stats: (
            <KnowledgeHeaderStats
              totalCount={embeddingSummary.totalCount}
              publishedCount={embeddingSummary.publishedCount}
            />
          ),
          sidePanel: (
            <KnowledgeEmbeddingRefreshPanel
              summary={embeddingSummary}
              initialBatch={embeddingRefreshBatch?.status === "running" ? embeddingRefreshBatch : null}
              canManage={canManageKnowledgeArchive}
              actions={embeddingRefreshPanelActions}
            />
          ),
        })}

        {errorMessage ? (
          <ErrorAlert message={errorMessage} />
        ) : (
          <section className={styles.pageGrid}>
            <KnowledgeList
              articles={articles}
              selectedId={selectedArticleId}
              view={view}
              initialSearchQuery={searchQuery}
              currentManager={currentManager}
            />
            <KnowledgeDetails
              key={selectedArticleId ?? (isCreatingArticle ? "create" : "empty")}
              selectedArticle={selectedArticle}
              history={history}
              currentManager={currentManager}
              isCreatingArticle={isCreatingArticle}
              actions={knowledgeDetailsActions}
            />
          </section>
        )}
      </div>
    </main>
  );
}
