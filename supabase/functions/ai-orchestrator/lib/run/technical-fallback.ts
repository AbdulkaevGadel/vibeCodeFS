import { getFailureErrorMessage } from "../errors.ts"
import {
  deliverPublishedMessage,
  publishAiResponse,
} from "../response/telegram-delivery.ts"
import type { PublishResult } from "../types.ts"
import { markAiRunExternalError } from "./rpc.ts"

export const TECHNICAL_FALLBACK_TEXT =
  "Сейчас AI-помощник временно не смог обработать вопрос. Пожалуйста, отправьте его ещё раз через 2 минуты."

type TechnicalFallbackResult = {
  handled: boolean
  type?: string
  status?: string
  response_kind?: string
  message_id?: string | null
}

export async function tryPublishTechnicalFallback({
  error,
  runId,
  processingToken,
  aiResultRecorded,
}: {
  error: unknown
  runId: string
  processingToken: string
  aiResultRecorded: boolean
}): Promise<TechnicalFallbackResult> {
  const errorMessage = getFailureErrorMessage(error)

  if (aiResultRecorded) {
    const markErrorResult = await markAiRunExternalError(runId, processingToken, errorMessage)

    if (markErrorResult.type !== "updated" && markErrorResult.type !== "already_recorded") {
      console.error("ai-orchestrator fallback external audit rejected:", JSON.stringify({
        run_id: runId,
        type: markErrorResult.type,
        status: markErrorResult.status,
      }))

      return { handled: false }
    }
  }

  const publishResult = await publishAiResponse(
    runId,
    processingToken,
    "technical_fallback",
    TECHNICAL_FALLBACK_TEXT,
  )

  return await handleFallbackPublishResult(runId, publishResult)
}

export async function publishSavedRetrievalTechnicalFallback(runId: string, processingToken: string) {
  const publishResult = await publishAiResponse(
    runId,
    processingToken,
    "technical_fallback",
    TECHNICAL_FALLBACK_TEXT,
  )

  return await handleFallbackPublishResult(runId, publishResult)
}

async function handleFallbackPublishResult(
  runId: string,
  publishResult: PublishResult,
): Promise<TechnicalFallbackResult> {
  if (publishResult.type === "published") {
    await deliverPublishedMessage(publishResult)
    return toHandledFallbackResult(publishResult)
  }

  if (
    publishResult.type === "already_published"
    || publishResult.type === "ignored"
    || publishResult.type === "obsolete"
  ) {
    return toHandledFallbackResult(publishResult)
  }

  console.error("ai-orchestrator fallback publish rejected:", JSON.stringify({
    run_id: runId,
    type: publishResult.type,
    status: publishResult.status,
  }))

  return { handled: false }
}

function toHandledFallbackResult(publishResult: PublishResult): TechnicalFallbackResult {
  return {
    handled: true,
    type: publishResult.type,
    status: publishResult.status,
    response_kind: publishResult.response_kind ?? "technical_fallback",
    message_id: publishResult.message_id ?? null,
  }
}
