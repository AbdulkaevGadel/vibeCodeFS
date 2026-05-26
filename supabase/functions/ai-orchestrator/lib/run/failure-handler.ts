import {
  classifyError,
  getErrorMessage,
  getFailureErrorMessage,
  getStageErrorMessage,
  RetrievalStageTimeoutError,
} from "../errors.ts"
import {
  finishAiRun,
  saveRetrievalResult,
  updateRunStage,
} from "./rpc.ts"
import type { AiRunStage } from "../types.ts"

type MarkStage = (stage: AiRunStage, stageError?: string | null) => Promise<void>

type HandleAiRunFailureParams = {
  error: unknown
  runId: string | null
  processingToken: string | null
  currentStage: AiRunStage | null
  aiResultRecorded: boolean
  correlationId: string
  markStage: MarkStage
}

export async function handleAiRunFailure({
  error,
  runId,
  processingToken,
  currentStage,
  aiResultRecorded,
  correlationId,
  markStage,
}: HandleAiRunFailureParams) {
  console.error("ai-orchestrator error:", getErrorMessage(error))

  if (!runId || !processingToken) {
    return
  }

  if (error instanceof RetrievalStageTimeoutError && currentStage) {
    await updateRunStage(runId, currentStage, "RETRIEVAL_STAGE_TIMEOUT", correlationId)
  } else {
    try {
      await markStage("failed", getStageErrorMessage(error))
    } catch (stageError) {
      console.error("ai-orchestrator failed to save failed stage:", getErrorMessage(stageError))
    }
  }

  if (!aiResultRecorded) {
    try {
      await saveRetrievalResult(runId, processingToken, {
        retrieval_status: "failed",
        top_similarity_score: null,
        matched_chunks_count: 0,
        chunks: [],
        error_type: classifyError(error),
        error_message: getFailureErrorMessage(error),
      })
    } catch (saveError) {
      console.error("ai-orchestrator failed to save retrieval failure:", getErrorMessage(saveError))
    }
  }

  try {
    await finishAiRun(
      runId,
      processingToken,
      "failed",
      getFailureErrorMessage(error),
      classifyError(error),
    )
  } catch (finishError) {
    console.error("ai-orchestrator failed to mark run failed:", getErrorMessage(finishError))
  }
}
