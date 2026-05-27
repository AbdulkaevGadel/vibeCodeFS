import { config } from "../config.ts"
import { getErrorMessage } from "../errors.ts"
import { callRpc } from "../rest.ts"
import type {
  AiRunStage,
  ContextSnapshot,
  IntentType,
  PromptSnapshot,
  RetrievalResult,
  RpcResult,
} from "../types.ts"

type StaleRunRecoveryResult = {
  type?: string
  recovered_count?: number
  run_ids?: string[]
  stale_after_minutes?: number
}

export async function recoverStaleAiRuns(chatId: string, correlationId: string) {
  if (!config.staleRunRecovery.enabled) {
    return { type: "disabled", error: null as string | null }
  }

  try {
    const result = await callRpc<StaleRunRecoveryResult>("recover_stale_chat_ai_runs", {
      p_chat_id: chatId,
      p_stale_after_minutes: config.staleRunRecovery.staleAfterMinutes,
      p_limit: config.staleRunRecovery.limit,
    })

    console.log("ai-orchestrator stale run recovery:", JSON.stringify({
      correlation_id: correlationId,
      type: result.type,
      recovered_count: result.recovered_count ?? 0,
      run_ids: result.run_ids ?? [],
      stale_after_minutes: result.stale_after_minutes ?? config.staleRunRecovery.staleAfterMinutes,
    }))

    return { type: result.type ?? "unknown", error: null as string | null }
  } catch (error) {
    const message = getErrorMessage(error)

    console.error("ai-orchestrator stale run recovery failed:", JSON.stringify({
      correlation_id: correlationId,
      error: message,
    }))

    return { type: "failed", error: message }
  }
}

export async function startAiRun(
  chatId: string,
  triggerMessageId: string,
  correlationId: string,
  configSnapshot: Record<string, unknown>,
  configHash: string,
) {
  return await callRpc<RpcResult>("start_chat_ai_run", {
    p_chat_id: chatId,
    p_trigger_message_id: triggerMessageId,
    p_prompt_version: config.promptVersion,
    p_correlation_id: correlationId,
    p_config_snapshot: configSnapshot,
    p_config_hash: configHash,
  })
}

export async function markAiRunProcessing(runId: string, processingToken: string) {
  return await callRpc<RpcResult>("mark_chat_ai_run_processing", {
    p_run_id: runId,
    p_processing_token: processingToken,
  })
}

export async function updateRunStage(
  runId: string,
  stage: AiRunStage,
  stageError: string | null,
  correlationId: string,
) {
  try {
    const result = await callRpc<RpcResult>("update_chat_ai_run_stage", {
      p_run_id: runId,
      p_current_stage: stage,
      p_stage_error: stageError,
    })

    if (result.type !== "updated") {
      console.error("ai-orchestrator stage update skipped:", JSON.stringify({
        correlation_id: correlationId,
        run_id: runId,
        stage,
        type: result.type,
      }))
    }
  } catch (error) {
    console.error("ai-orchestrator stage update failed:", JSON.stringify({
      correlation_id: correlationId,
      run_id: runId,
      stage,
      error: getErrorMessage(error),
    }))
  }
}

export async function saveRetrievalResult(runId: string, processingToken: string, result: RetrievalResult) {
  return await callRpc<RpcResult>("save_chat_ai_retrieval_result", {
    p_run_id: runId,
    p_processing_token: processingToken,
    p_retrieval_status: result.retrieval_status,
    p_top_similarity_score: result.top_similarity_score,
    p_matched_chunks_count: result.matched_chunks_count,
    p_retrieval_chunks: result.chunks,
    p_error_message: result.error_message ?? null,
    p_error_type: result.error_type ?? null,
  })
}

export async function saveIntentResult(runId: string, processingToken: string, intentType: IntentType) {
  return await callRpc<RpcResult>("save_chat_ai_intent_result", {
    p_run_id: runId,
    p_processing_token: processingToken,
    p_intent_type: intentType,
  })
}

export async function saveContextPromptSnapshot(
  runId: string,
  processingToken: string,
  contextSnapshot: ContextSnapshot,
  promptSnapshot: PromptSnapshot,
) {
  return await callRpc<RpcResult>("save_chat_ai_context_prompt_snapshot", {
    p_run_id: runId,
    p_processing_token: processingToken,
    p_context_snapshot: contextSnapshot,
    p_prompt_snapshot: promptSnapshot,
  })
}

export async function markAiRunExternalError(
  runId: string,
  processingToken: string,
  errorMessage: string,
) {
  return await callRpc<RpcResult>("mark_chat_ai_run_external_error", {
    p_run_id: runId,
    p_processing_token: processingToken,
    p_error_message: errorMessage,
    p_error_type: "external",
  })
}

export async function finishAiRun(
  runId: string,
  processingToken: string,
  finalStatus: "completed" | "failed" | "ignored",
  errorMessage: string | null,
  errorType: string | null,
) {
  return await callRpc<RpcResult>("finish_chat_ai_run", {
    p_run_id: runId,
    p_processing_token: processingToken,
    p_final_status: finalStatus,
    p_error_message: errorMessage,
    p_error_type: errorType,
  })
}
