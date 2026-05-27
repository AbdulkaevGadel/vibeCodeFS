import { callRest } from "../rest.ts"

type ChatStatusRow = {
  status: string
}

export async function isChatAiEligibleForPublish(chatId: string) {
  const rows = await callRest<ChatStatusRow[]>(
    `/rest/v1/chats?id=eq.${encodeURIComponent(chatId)}&select=status&limit=1`,
  )
  const status = rows[0]?.status

  return status !== "waiting_operator"
    && status !== "in_progress"
    && status !== "resolved"
    && status !== "closed"
}
