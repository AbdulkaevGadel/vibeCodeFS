import { config } from "../config.ts"
import type { OrchestratorPayload } from "../payload.ts"
import {
  markAiRunProcessing,
  recoverStaleAiRuns,
  startAiRun,
} from "./rpc.ts"
import { hashJson } from "../utils.ts"

type ClaimedAiRun = {
  type: "claimed"
  runId: string
  processingToken: string
}

type SkippedAiRun = {
  type: "skipped"
  result: Record<string, unknown>
}

export async function startProcessingAiRun(
  payload: OrchestratorPayload,
  correlationId: string,
): Promise<ClaimedAiRun | SkippedAiRun> {
  const configSnapshot: Record<string, unknown> = {
    prompt_version: config.promptVersion,
    retrieval: config.retrieval,
    context: config.context,
    llm: {
      provider: config.llm.provider,
      model: config.llm.model,
      endpoint: config.llm.endpoint,
      requestTimeoutMs: config.llm.requestTimeoutMs,
      maxProviderRetries: config.llm.maxProviderRetries,
      maxOutputTokens: config.llm.maxOutputTokens,
      temperature: config.llm.temperature,
    },
    behavior: config.behavior,
  }
  const configHash = await hashJson(configSnapshot)
  const recoveryResult = await recoverStaleAiRuns(payload.chat_id, correlationId)
  const startResult = await startAiRun(
    payload.chat_id,
    payload.trigger_message_id,
    correlationId,
    configSnapshot,
    configHash,
  )
  const runId = startResult.run_id ?? null

  if (startResult.type !== "started" || !runId) {
    console.log("ai-orchestrator skipped:", JSON.stringify({
      correlation_id: correlationId,
      type: startResult.type,
      run_id: runId,
      stale_recovery_type: recoveryResult.type,
      stale_recovery_error: recoveryResult.error,
    }))

    return {
      type: "skipped",
      result: { ok: true, type: startResult.type, run_id: runId },
    }
  }

  const processingToken = crypto.randomUUID()
  const processingResult = await markAiRunProcessing(runId, processingToken)

  if (processingResult.type !== "processing" && processingResult.type !== "already_processing") {
    return {
      type: "skipped",
      result: {
        ok: true,
        type: processingResult.type,
        run_id: runId,
      },
    }
  }

  return {
    type: "claimed",
    runId,
    processingToken,
  }
}
