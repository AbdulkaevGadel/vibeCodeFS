import { AdminHeader } from "../../_components/admin-header";
import { ErrorAlert } from "../../_components/error-alert";
import { KnowledgeList } from "../../_components/knowledge/knowledge-list";
import { KnowledgeDetails } from "../../_components/knowledge/knowledge-details";
import {
  KnowledgeArchiveAction,
  KnowledgeHeaderStats,
} from "../../_components/knowledge/knowledge-header-content";
import { KnowledgeEmbeddingRefreshPanel } from "../../_components/knowledge/knowledge-embedding-refresh-panel";
import { getKnowledgeBaseData } from "../../_lib/get-knowledge-base-data";
import { PageProps } from "../../_lib/page-types";
import styles from "../../page.module.css";

export const dynamic = "force-dynamic";

export default async function KnowledgeBasePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const selectedArticleId = typeof params?.article === "string" ? params.article : null;
  const searchQuery = typeof params?.search === "string" ? params.search : null;
  const requestedView = params?.view === "archive" ? "archive" : "active";
  const isCreatingArticle = params?.mode === "create" && requestedView === "active";
  
  const pageData = await getKnowledgeBaseData(selectedArticleId, searchQuery, requestedView);
  const canManageKnowledgeArchive = pageData.currentManager?.role === "admin"
    || pageData.currentManager?.role === "supervisor";

  return (
    <main className={styles.pageMain}>
      <div className={styles.pageContent}>
        <AdminHeader
          title="База знаний"
          allManagers={pageData.allManagers}
          currentManager={pageData.currentManager}
          navigationHref="/"
          navigationLabel="← Вернуться к чатам"
          secondaryActions={canManageKnowledgeArchive ? (
            <KnowledgeArchiveAction isArchiveView={pageData.view === "archive"} />
          ) : null}
          stats={(
            <KnowledgeHeaderStats
              totalCount={pageData.embeddingSummary.totalCount}
              publishedCount={pageData.embeddingSummary.publishedCount}
            />
          )}
          sidePanel={(
            <KnowledgeEmbeddingRefreshPanel
              summary={pageData.embeddingSummary}
              initialBatch={
                pageData.embeddingRefreshBatch?.status === "running"
                  ? pageData.embeddingRefreshBatch
                  : null
              }
              canManage={canManageKnowledgeArchive}
            />
          )}
        />

        {pageData.errorMessage ? (
          <ErrorAlert message={pageData.errorMessage} />
        ) : (
          <section className={styles.pageGrid}>
            <KnowledgeList 
               articles={pageData.articles} 
               selectedId={selectedArticleId} 
               view={pageData.view}
               initialSearchQuery={searchQuery ?? ""}
               currentManager={pageData.currentManager}
            />
            <KnowledgeDetails 
               key={selectedArticleId ?? (isCreatingArticle ? "create" : "empty")}
               selectedArticle={pageData.selectedArticle}
               history={pageData.history}
               currentManager={pageData.currentManager}
               isCreatingArticle={isCreatingArticle}
            />
          </section>
        )}
      </div>
    </main>
  );
}
