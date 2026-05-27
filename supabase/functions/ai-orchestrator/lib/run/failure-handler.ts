import {
  classifyError,
  getErrorMessage,
  getFailureErrorMessage,
  getStageErrorMessage,
  isTemporaryExternalFailure,
  RetrievalStageTimeoutError,
} from "../errors.ts"
import {
  finishAiRun,
  saveRetrievalResult,
  updateRunStage,
} from "./rpc.ts"
import { tryPublishTechnicalFallback } from "./technical-fallback.ts"
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
    return {
      ok: false,
      type: "system_error",
      run_id: runId,
    }
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
    if (isTemporaryExternalFailure(error)) {
      const fallbackResult = await tryPublishTechnicalFallback({
        error,
        runId,
        processingToken,
        aiResultRecorded,
      })

      if (fallbackResult.handled) {
        return {
          ok: true,
          type: fallbackResult.type,
          status: fallbackResult.status,
          run_id: runId,
          response_kind: fallbackResult.response_kind,
          response_message_id: fallbackResult.message_id,
        }
      }
    }

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

  return {
    ok: false,
    type: "failed",
    run_id: runId,
  }
}
