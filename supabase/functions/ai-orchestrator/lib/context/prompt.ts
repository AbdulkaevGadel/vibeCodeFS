import { config } from "../config.ts"
import type { ContextSnapshot, KbFragment, PromptMessage, PromptSnapshot, SnapshotMessage } from "../types.ts"

export function buildPromptSnapshot(contextSnapshot: ContextSnapshot): PromptSnapshot {
  const historyText = contextSnapshot.history_messages.length > 0
    ? contextSnapshot.history_messages.map(formatHistoryMessage).join("\n")
    : "Нет предыдущего client/ai контекста."

  const kbText = contextSnapshot.kb_fragments.map(formatKbFragment).join("\n\n")

  const messages: PromptMessage[] = [
    {
      role: "system",
      content: [
        "Ты backend-only AI assistant службы поддержки.",
        "Current client message is the primary task. Recent client/ai history is auxiliary context only.",
        "If current client message changes topic, follow the current message and do not continue the previous topic.",
        "Отвечай только на основе KB fragments that are relevant to the current client message.",
        "Use KB fragments as support policy and turn them into a client-facing Russian support reply.",
        "Do not answer from recent history when KB fragments for the current message describe another scenario.",
        "Если в KB fragments нет достаточной информации for the current message, скажи, что данных недостаточно.",
        "Не придумывай правила, сроки, статусы, цены или обещания.",
        "Не принимай workflow decisions вроде handoff.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "Current client message:",
        contextSnapshot.current_message.text,
        "",
        "Instruction:",
        "Answer the current client message. Use recent history only to understand context, never to replace the current topic.",
        "",
        "Recent client/ai history:",
        historyText,
        "",
        "KB fragments:",
        kbText,
      ].join("\n"),
    },
  ]

  return {
    messages,
    prompt_version: config.promptVersion,
    builder_version: config.context.builderVersion,
    estimated_chars: messages.reduce((sum, message) => sum + message.content.length, 0),
  }
}

function formatHistoryMessage(message: SnapshotMessage) {
  const role = message.sender_type === "client" ? "client" : "ai"

  return `[${role} ${message.created_at}] ${message.text}`
}

function formatKbFragment(fragment: KbFragment) {
  return [
    `[fragment chunk_id=${fragment.chunk_id} article_id=${fragment.article_id} chunk_index=${fragment.chunk_index}]`,
    fragment.text,
  ].join("\n")
}
