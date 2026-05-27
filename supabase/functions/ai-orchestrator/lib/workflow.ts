import { buildContextAndPrompt, fetchTriggerMessage } from "./context/context.ts"
import { handleAiRunFailure } from "./run/failure-handler.ts"
import { classifyIntent } from "./intent/intent.ts"
import { processIntentBranch } from "./intent/intent-branch.ts"
import type { OrchestratorPayload } from "./payload.ts"
import {
  isSuccessfulRetrievalSaveType,
  runRetrievalWithHardTimeout,
  validateRetrievalConfig,
} from "./retrieval/retrieval.ts"
import { handleRetrievalSaveRejection } from "./retrieval/retrieval-save-rejection.ts"
import {
  finishAiRun,
  saveContextPromptSnapshot,
  updateRunStage,
} from "./run/rpc.ts"
import { startProcessingAiRun } from "./run/run-lifecycle.ts"
import { publishSavedRetrievalTechnicalFallback } from "./run/technical-fallback.ts"
import { isChatAiEligibleForPublish } from "./response/publish-eligibility.ts"
import { decideResponseBranch } from "./response/response-branch.ts"
import {
  deliverPublishedMessage,
  publishAiResponse,
} from "./response/telegram-delivery.ts"
import type { AiRunStage, ContextSnapshot, PromptSnapshot } from "./types.ts"

export async function processAiRun(
  payload: OrchestratorPayload,
  correlationId: string,
): Promise<Record<string, unknown>> {
  let runId: string | null = null
  let processingToken: string | null = null
  let aiResultRecorded = false
  let currentStage: AiRunStage | null = null

  const markStage = async (stage: AiRunStage, stageError: string | null = null) => {
    currentStage = stage

    if (!runId) {
      return
    }

    await updateRunStage(runId, stage, stageError, correlationId)
  }

  try {
    validateRetrievalConfig()

    const processingRun = await startProcessingAiRun(payload, correlationId)

    if (processingRun.type === "skipped") {
      return processingRun.result
    }

    runId = processingRun.runId
    processingToken = processingRun.processingToken

    await markStage("processing_marked")

    const triggerMessage = await fetchTriggerMessage(payload.trigger_message_id)
    await markStage("trigger_loaded")

    const intent = classifyIntent(triggerMessage.text)

    if (intent) {
      return await processIntentBranch({
        chatId: payload.chat_id,
        runId,
        processingToken,
        intentType: intent.type,
        markAiResultRecorded: () => {
          aiResultRecorded = true
        },
      })
    }

    const retrievalResult = await runRetrievalWithHardTimeout(triggerMessage, runId, processingToken, markStage)

    if (!isSuccessfulRetrievalSaveType(retrievalResult.type)) {
      return await handleRetrievalSaveRejection({
        runId,
        processingToken,
        retrievalResult,
        markStage,
        markAiResultRecorded: () => {
          aiResultRecorded = true
        },
      })
    }

    aiResultRecorded = true
    await markStage("retrieval_saved")

    if (!(await isChatAiEligibleForPublish(payload.chat_id))) {
      const finishResult = await finishAiRun(runId, processingToken, "ignored", null, null)

      return {
        ok: true,
        type: finishResult.type,
        status: finishResult.status,
        run_id: runId,
        retrieval_status: retrievalResult.retrieval_status,
      }
    }

    let contextSnapshot: ContextSnapshot | null = null
    let promptSnapshot: PromptSnapshot | null = null

    if (retrievalResult.retrieval_status === "hit") {
      const snapshots = await buildContextAndPrompt(payload.trigger_message_id, retrievalResult)
      contextSnapshot = snapshots.contextSnapshot
      promptSnapshot = snapshots.promptSnapshot

      const snapshotResult = await saveContextPromptSnapshot(
        runId,
        processingToken,
        contextSnapshot,
        promptSnapshot,
      )

      if (snapshotResult.type !== "saved" && snapshotResult.type !== "already_saved") {
        return {
          ok: true,
          type: snapshotResult.type,
          run_id: runId,
        }
      }
    }

    if (retrievalResult.retrieval_status === "failed") {
      if (retrievalResult.error_type === "external") {
        const fallbackResult = await publishSavedRetrievalTechnicalFallback(runId, processingToken)

        if (fallbackResult.handled) {
          return {
            ok: true,
            type: fallbackResult.type,
            status: fallbackResult.status,
            run_id: runId,
            retrieval_status: retrievalResult.retrieval_status,
            response_kind: fallbackResult.response_kind,
            response_message_id: fallbackResult.message_id,
          }
        }
      }

      const finishResult = await finishAiRun(
        runId,
        processingToken,
        "failed",
        retrievalResult.error_message ?? "RETRIEVAL_FAILED",
        retrievalResult.error_type ?? "system",
      )

      return {
        ok: true,
        type: finishResult.type,
        status: finishResult.status,
        run_id: runId,
        retrieval_status: retrievalResult.retrieval_status,
      }
    }

    const branch = await decideResponseBranch(
      payload.chat_id,
      runId,
      retrievalResult,
      promptSnapshot,
      triggerMessage.text,
    )
    const publishResult = await publishAiResponse(runId, processingToken, branch.kind, branch.text)

    if (publishResult.type === "published") {
      await deliverPublishedMessage(publishResult)
    }

    return {
      ok: true,
      type: publishResult.type,
      status: publishResult.status,
      run_id: runId,
      retrieval_status: retrievalResult.retrieval_status,
      response_kind: publishResult.response_kind ?? branch.kind,
      response_message_id: publishResult.message_id ?? null,
      matched_chunks_count: retrievalResult.matched_chunks_count,
      top_similarity_score: retrievalResult.top_similarity_score,
      context_snapshot_saved: contextSnapshot !== null,
      prompt_snapshot_saved: promptSnapshot !== null,
    }
  } catch (error) {
    const failureResult = await handleAiRunFailure({
      error,
      runId,
      processingToken,
      currentStage,
      aiResultRecorded,
      correlationId,
      markStage,
    })

    return {
      ...failureResult,
      current_stage: currentStage,
    }
  }
}
