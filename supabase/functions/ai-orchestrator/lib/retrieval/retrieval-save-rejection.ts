import { getErrorMessage } from "../errors.ts"
import { getRetrievalSaveFailureMessage } from "./retrieval.ts"
import {
  finishAiRun,
  saveRetrievalResult,
} from "../run/rpc.ts"
import type { AiRunStage, PersistedRetrievalResult } from "../types.ts"

type MarkStage = (stage: AiRunStage, stageError?: string | null) => Promise<void>

type HandleRetrievalSaveRejectionParams = {
  runId: string
  processingToken: string
  retrievalResult: PersistedRetrievalResult
  markStage: MarkStage
  markAiResultRecorded: () => void
}

export async function handleRetrievalSaveRejection({
  runId,
  processingToken,
  retrievalResult,
  markStage,
  markAiResultRecorded,
}: HandleRetrievalSaveRejectionParams): Promise<Record<string, unknown>> {
  const errorMessage = getRetrievalSaveFailureMessage(retrievalResult.type)

  await markStage("failed", errorMessage)

  try {
    const failureSaveResult = await saveRetrievalResult(runId, processingToken, {
      retrieval_status: "failed",
      top_similarity_score: null,
      matched_chunks_count: 0,
      chunks: [],
      error_type: "system",
      error_message: errorMessage,
    })

    if (failureSaveResult.type === "saved" || failureSaveResult.type === "already_saved") {
      markAiResultRecorded()
    }
  } catch (saveError) {
    console.error("ai-orchestrator failed to save retrieval save rejection:", getErrorMessage(saveError))
  }

  const finishResult = await finishAiRun(runId, processingToken, "failed", errorMessage, "system")

  return {
    ok: true,
    type: retrievalResult.type ?? "retrieval_save_failed",
    status: finishResult.status,
    run_id: runId,
    retrieval_status: "failed",
    error_type: "system",
    error_message: errorMessage,
  }
}
