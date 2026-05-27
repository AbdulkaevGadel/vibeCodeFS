import { config } from "../config.ts"
import { fetchEmbedding } from "./embedding-provider.ts"
import { OrchestratorError, RetrievalStageTimeoutError } from "../errors.ts"
import { getRetrievalQueryText } from "../intent/message-text.ts"
import { saveRetrievalFromEmbedding } from "./retrieval-rpc.ts"
export {
  getRetrievalSaveFailureMessage,
  isSuccessfulRetrievalSaveType,
} from "./retrieval-save-result.ts"
import type { AiRunStage, PersistedRetrievalResult, TriggerMessage } from "../types.ts"

export async function runRetrievalWithHardTimeout(
  triggerMessage: TriggerMessage,
  runId: string,
  processingToken: string,
  markStage: (stage: AiRunStage, stageError?: string | null) => Promise<void>,
): Promise<PersistedRetrievalResult> {
  const controller = new AbortController()
  const retrievalPromise = runRetrieval(triggerMessage, runId, processingToken, markStage, controller.signal)
  let timeoutId: number | undefined
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      reject(new RetrievalStageTimeoutError())
    }, config.retrieval.stageTimeoutMs)
  })

  try {
    return await Promise.race([retrievalPromise, timeoutPromise])
  } catch (error) {
    if (controller.signal.aborted || error instanceof RetrievalStageTimeoutError) {
      throw new RetrievalStageTimeoutError()
    }

    throw error
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

export function validateRetrievalConfig() {
  if (config.retrieval.candidateCount < config.retrieval.matchCount * 5) {
    throw new OrchestratorError("RETRIEVAL_CANDIDATE_COUNT must be at least match_count * 5", "validation")
  }
}

async function runRetrieval(
  triggerMessage: TriggerMessage,
  runId: string,
  processingToken: string,
  markStage: (stage: AiRunStage, stageError?: string | null) => Promise<void>,
  signal: AbortSignal,
): Promise<PersistedRetrievalResult> {
  await markStage("retrieval_started")

  const queryText = getRetrievalQueryText(triggerMessage.text)
  await markStage("embedding_started")

  const queryEmbedding = await fetchEmbedding(queryText, signal)
  await markStage("embedding_finished")
  await markStage("retrieval_rpc_started")

  return await saveRetrievalFromEmbedding(runId, processingToken, queryText, queryEmbedding, signal)
}
