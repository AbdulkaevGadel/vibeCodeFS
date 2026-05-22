import {
  KnowledgeBasePage as KnowledgeBaseFsdPage,
} from "@/fsd-pages/knowledge-base";
import type { KnowledgeDetailsActions } from "@/widgets/knowledge-details";
import type { KnowledgeEmbeddingRefreshPanelActions } from "@/widgets/knowledge-embedding-refresh-panel";
import { AdminHeader } from "../../_components/admin-header";
import {
  deleteArticleAction,
  getArticleEmbeddingStateAction,
  getKnowledgeEmbeddingRefreshBatchStateAction,
  refreshArticleEmbeddingsAction,
  setArticleStatusAction,
  startKnowledgeEmbeddingRefreshBatchAction,
  upsertArticleAction,
} from "../_actions/knowledge-actions";
import { getKnowledgeBaseData } from "../../_lib/get-knowledge-base-data";
import { PageProps } from "../../_lib/page-types";

export const dynamic = "force-dynamic";

export default async function KnowledgeBasePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const selectedArticleId = typeof params?.article === "string" ? params.article : null;
  const searchQuery = typeof params?.search === "string" ? params.search : null;
  const requestedView = params?.view === "archive" ? "archive" : "active";
  const isCreatingArticle = params?.mode === "create" && requestedView === "active";
  
  const pageData = await getKnowledgeBaseData(selectedArticleId, searchQuery, requestedView);
  const knowledgeDetailsActions: KnowledgeDetailsActions = {
    deleteArticle: deleteArticleAction,
    getArticleEmbeddingState: getArticleEmbeddingStateAction,
    refreshArticleEmbeddings: refreshArticleEmbeddingsAction,
    setArticleStatus: setArticleStatusAction,
    upsertArticle: upsertArticleAction,
  };
  const embeddingRefreshPanelActions: KnowledgeEmbeddingRefreshPanelActions = {
    getBatchState: getKnowledgeEmbeddingRefreshBatchStateAction,
    startBatch: startKnowledgeEmbeddingRefreshBatchAction,
  };

  return (
    <KnowledgeBaseFsdPage
      articles={pageData.articles}
      selectedArticle={pageData.selectedArticle}
      selectedArticleId={selectedArticleId}
      history={pageData.history}
      currentManager={pageData.currentManager}
      allManagers={pageData.allManagers}
      view={pageData.view}
      searchQuery={searchQuery ?? ""}
      isCreatingArticle={isCreatingArticle}
      embeddingSummary={pageData.embeddingSummary}
      embeddingRefreshBatch={pageData.embeddingRefreshBatch}
      errorMessage={pageData.errorMessage}
      knowledgeDetailsActions={knowledgeDetailsActions}
      embeddingRefreshPanelActions={embeddingRefreshPanelActions}
      renderHeaderShell={(headerProps) => (
        <AdminHeader
          {...headerProps}
        />
      )}
    />
  );
}
