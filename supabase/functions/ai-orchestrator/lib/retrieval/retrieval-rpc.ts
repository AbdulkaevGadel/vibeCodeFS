import { config } from "../config.ts"
import { OrchestratorError } from "../errors.ts"
import { callRpc } from "../rest.ts"
import type { PersistedRetrievalResult, RetrievalResult } from "../types.ts"

export async function saveRetrievalFromEmbedding(
  runId: string,
  processingToken: string,
  queryText: string,
  queryEmbedding: number[],
  signal: AbortSignal,
) {
  const result = await callRpc<PersistedRetrievalResult>("save_chat_ai_retrieval_from_json_v1", {
    p_run_id: runId,
    p_processing_token: processingToken,
    p_query_embedding_json: queryEmbedding,
    p_query_text: queryText,
    p_match_threshold: config.retrieval.matchThreshold,
    p_match_count: config.retrieval.matchCount,
    p_candidate_count: config.retrieval.candidateCount,
  }, { signal })

  return normalizePersistedRetrievalResult(result)
}

function normalizeRetrievalResult(value: RetrievalResult): RetrievalResult {
  if (!["hit", "miss", "empty", "failed"].includes(value.retrieval_status)) {
    throw new OrchestratorError("Retrieval RPC returned invalid status", "system")
  }

  if (!Array.isArray(value.chunks)) {
    throw new OrchestratorError("Retrieval RPC returned invalid chunks", "system")
  }

  return {
    retrieval_status: value.retrieval_status,
    top_similarity_score: typeof value.top_similarity_score === "number" ? value.top_similarity_score : null,
    matched_chunks_count: Number.isInteger(value.matched_chunks_count) ? value.matched_chunks_count : 0,
    chunks: value.chunks,
    error_type: value.error_type,
    error_message: value.error_message,
  }
}

function normalizePersistedRetrievalResult(value: PersistedRetrievalResult): PersistedRetrievalResult {
  const normalized = normalizeRetrievalResult(value)

  return {
    ...normalized,
    type: value.type,
    run_id: value.run_id ?? null,
    status: value.status,
  }
}
