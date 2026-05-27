import { fetchKbFragments, fetchRecentHistory } from "./context-sources.ts"
import { buildContextSnapshot } from "./context-snapshot.ts"
import { OrchestratorError } from "../errors.ts"
import { buildPromptSnapshot } from "./prompt.ts"
import { callRest } from "../rest.ts"
import type { RetrievalResult, TriggerMessage } from "../types.ts"

export async function fetchTriggerMessage(triggerMessageId: string): Promise<TriggerMessage> {
  const rows = await callRest<TriggerMessage[]>(
    `/rest/v1/chat_messages?id=eq.${encodeURIComponent(triggerMessageId)}&select=id,chat_id,text,sender_type,created_at&limit=1`,
  )
  const message = rows[0]

  if (!message) {
    throw new OrchestratorError("Trigger message was not found", "validation")
  }

  if (message.sender_type !== "client") {
    throw new OrchestratorError("Trigger message is not a client message", "validation")
  }

  if (!message.text.trim()) {
    throw new OrchestratorError("Trigger message text is empty", "validation")
  }

  return message
}

export async function buildContextAndPrompt(triggerMessageId: string, retrievalResult: RetrievalResult) {
  const triggerMessage = await fetchTriggerMessage(triggerMessageId)
  const [historyMessages, kbFragments] = await Promise.all([
    fetchRecentHistory(triggerMessage),
    fetchKbFragments(retrievalResult.chunks),
  ])

  if (kbFragments.length === 0) {
    throw new OrchestratorError("Retrieval hit has no usable KB fragments", "system")
  }

  const contextSnapshot = buildContextSnapshot(triggerMessage, historyMessages, kbFragments, retrievalResult)
  const promptSnapshot = buildPromptSnapshot(contextSnapshot)

  return { contextSnapshot, promptSnapshot }
}
