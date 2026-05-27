import { callRest } from "../rest.ts"
import { formatAiReplyText } from "./response-text.ts"
import type { IntentType, ResponseBranch, ResponseKind, RetrievalResult } from "../types.ts"

type ChatAiRunSummary = {
  response_kind: "none" | ResponseKind
  retrieval_status: "not_started" | RetrievalResult["retrieval_status"] | "skipped"
  intent_type: IntentType | null
  completed_at: string
  created_at: string
}

type StatusResetBoundary = {
  created_at: string
}

export async function decideBusinessMissBranch(chatId: string, runId: string): Promise<ResponseBranch> {
  const previousMissCount = await fetchConsecutiveBusinessMissCount(chatId, runId)

  if (previousMissCount >= 1) {
    return {
      kind: "handoff",
      text: await formatAiReplyText(
        chatId,
        "Я всё ещё не нашёл достаточно точной информации в базе знаний. Передаю чат оператору службы поддержки.",
      ),
    }
  }

  return {
    kind: "clarify",
    text: await formatAiReplyText(
      chatId,
      "Я не нашёл достаточно точной информации в базе знаний. Попробуйте, пожалуйста, переформулировать вопрос или добавить детали.",
    ),
  }
}

async function fetchConsecutiveBusinessMissCount(chatId: string, runId: string) {
  const resetBoundary = await fetchLatestMissResetBoundary(chatId)
  const query = [
    `chat_id=eq.${encodeURIComponent(chatId)}`,
    `id=neq.${encodeURIComponent(runId)}`,
    "status=eq.completed",
    "response_kind=in.(answer,clarify,handoff,intent_reply)",
    "select=response_kind,retrieval_status,intent_type,completed_at,created_at",
    "order=completed_at.desc,created_at.desc",
    "limit=10",
  ].join("&")
  const rows = await callRest<ChatAiRunSummary[]>(`/rest/v1/chat_ai_runs?${query}`)
  let count = 0

  for (const row of rows) {
    const rowCompletedAt = Date.parse(row.completed_at ?? row.created_at)

    if (resetBoundary && Number.isFinite(rowCompletedAt) && rowCompletedAt <= resetBoundary.getTime()) {
      break
    }

    if (row.response_kind === "answer") {
      break
    }

    if (
      (row.response_kind === "clarify" || row.response_kind === "handoff")
      && row.retrieval_status !== "skipped"
      && row.intent_type === null
    ) {
      count += 1
    }
  }

  return count
}

async function fetchLatestMissResetBoundary(chatId: string) {
  const query = [
    `chat_id=eq.${encodeURIComponent(chatId)}`,
    "from_status=eq.waiting_operator",
    "to_status=in.(open,in_progress)",
    "select=created_at",
    "order=created_at.desc",
    "limit=1",
  ].join("&")
  const rows = await callRest<StatusResetBoundary[]>(`/rest/v1/chat_status_history?${query}`)
  const createdAt = rows[0]?.created_at

  if (!createdAt) {
    return null
  }

  const timestamp = Date.parse(createdAt)

  return Number.isFinite(timestamp) ? new Date(timestamp) : null
}
