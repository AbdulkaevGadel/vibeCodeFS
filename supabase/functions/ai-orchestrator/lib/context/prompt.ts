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
        "Отвечай только на основе KB fragments.",
        "Если в KB fragments нет достаточной информации, скажи, что данных недостаточно.",
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
