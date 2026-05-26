export type RpcResult = {
  type?: string
  run_id?: string | null
  status?: string
}

export type ResponseKind = "answer" | "clarify" | "handoff" | "intent_reply"

export type PublishResult = RpcResult & {
  response_kind?: ResponseKind
  message_id?: string | null
  telegram_chat_id?: number | null
  text?: string | null
}
