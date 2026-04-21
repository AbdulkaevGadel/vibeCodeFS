import { cookies } from "next/headers";
import { AdminHeader } from "../../_components/admin-header";
import { ErrorAlert } from "../../_components/error-alert";
import { KnowledgeList } from "../../_components/knowledge/knowledge-list";
import { KnowledgeDetails } from "../../_components/knowledge/knowledge-details";
import { getKnowledgeBaseData } from "../../_lib/get-knowledge-base-data";
import { PageProps } from "../../_lib/page-types";
import styles from "../../page.module.css";

export const dynamic = "force-dynamic";

export default async function KnowledgeBasePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const selectedArticleId = typeof params?.article === "string" ? params.article : null;
  const searchQuery = typeof params?.search === "string" ? params.search : null;
  
  const pageData = await getKnowledgeBaseData(selectedArticleId, searchQuery);

  // Для шапки нам нужны базовые данные менеджера (подтянем из pageData)
  // В идеале мы должны иметь общий провайдер или кэшировать это, 
  // но пока используем данные из нашего геттера.

  return (
    <main className={styles.pageMain}>
      <div className={styles.pageContent}>
        <AdminHeader
          headerBotLabel="База знаний"
          messageCount={0}
          chatCount={0}
          botOptions={[]}
          selectedBotKey={null}
          allManagers={[]} 
          currentManager={pageData.currentManager}
          kbTotalCount={pageData.totalCount}
          kbPublishedCount={pageData.publishedCount}
        />

        {pageData.errorMessage ? (
          <ErrorAlert message={pageData.errorMessage} />
        ) : (
          <section className={styles.pageGrid}>
            <KnowledgeList 
               articles={pageData.articles} 
               selectedId={selectedArticleId} 
            />
            <KnowledgeDetails 
               key={selectedArticleId ?? 'new'}
               selectedArticle={pageData.selectedArticle}
               history={pageData.history}
               currentManager={pageData.currentManager}
            />
          </section>
        )}
      </div>
    </main>
  );
}
