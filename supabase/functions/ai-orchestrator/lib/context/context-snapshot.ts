import { config } from "../config.ts"
import type { ChatMessageRow } from "./context-sources.ts"
import type {
  ContextSnapshot,
  KbFragment,
  RetrievalResult,
  SnapshotMessage,
  TriggerMessage,
} from "../types.ts"
import { truncateText } from "../utils.ts"

export function buildContextSnapshot(
  triggerMessage: TriggerMessage,
  historyMessages: ChatMessageRow[],
  kbFragments: KbFragment[],
  retrievalResult: RetrievalResult,
): ContextSnapshot {
  const currentMessageText = truncateText(triggerMessage.text, config.context.maxCurrentMessageChars)
  const historySnapshot = historyMessages.map((message) => {
    const text = truncateText(message.text, config.context.maxHistoryMessageChars)

    return {
      id: message.id,
      sender_type: message.sender_type as "client" | "ai",
      created_at: message.created_at,
      text: text.text,
      truncated: text.truncated,
    }
  })

  return {
    current_message: {
      id: triggerMessage.id,
      sender_type: "client",
      created_at: triggerMessage.created_at,
      text: currentMessageText.text,
      truncated: currentMessageText.truncated,
    },
    history_messages: historySnapshot,
    kb_fragments: fitKbFragmentsToBudget(historySnapshot, kbFragments, currentMessageText.text),
    limits: config.context,
    source_counts: {
      retrieved_chunks: retrievalResult.chunks.length,
      usable_chunks: kbFragments.length,
      history_messages: historySnapshot.length,
      client_history_messages: historySnapshot.filter((message) => message.sender_type === "client").length,
      ai_history_messages: historySnapshot.filter((message) => message.sender_type === "ai").length,
    },
  }
}

function fitKbFragmentsToBudget(
  historyMessages: SnapshotMessage[],
  kbFragments: KbFragment[],
  currentMessageText: string,
) {
  const baseSize = currentMessageText.length
    + historyMessages.reduce((sum, message) => sum + message.text.length, 0)
    + 1200

  let totalSize = baseSize
  const selected: KbFragment[] = []

  for (const fragment of kbFragments) {
    const nextSize = totalSize + fragment.text.length + 200

    if (nextSize > config.context.maxPromptChars && selected.length > 0) {
      break
    }

    selected.push(fragment)
    totalSize = nextSize
  }

  return selected
}
