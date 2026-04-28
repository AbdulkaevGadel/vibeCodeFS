import type { TelegramMessage } from "../types/telegram.ts"
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./env.ts"

export type IncomingMessageSaveResult = {
  chatId: string
  messageId: string | null
  inserted: boolean
  isDuplicate: boolean
}

type IncomingMessageRpcResult = {
  chat_id?: string
  message_id?: string | null
  inserted?: boolean
  is_duplicate?: boolean
}

export async function saveIncomingMessage(
  message: TelegramMessage,
  botUsername: string | null,
): Promise<IncomingMessageSaveResult | null> {
  const supabaseUrl = getSupabaseUrl()
  const serviceRoleKey = getSupabaseServiceRoleKey()
  const chatId = message.chat?.id
  const userId = message.from?.id
  const text = message.text?.trim()

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Supabase env is not configured for message persistence")
    return null
  }

  if (!chatId || !userId || !text) {
    console.error("Message is missing required fields for database insert")
    return null
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/process_incoming_telegram_message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      p_telegram_user_id: userId,
      p_username: message.from?.username ?? null,
      p_first_name: message.from?.first_name ?? null,
      p_last_name: message.from?.last_name ?? null,
      p_telegram_chat_id: chatId,
      p_bot_username: botUsername,
      p_telegram_message_id: message.message_id,
      p_text: text,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Supabase insert error ${response.status}: ${errorText}`)
  }

  const result = (await response.json()) as IncomingMessageRpcResult

  if (!result.chat_id || typeof result.inserted !== "boolean") {
    console.error("Unexpected process_incoming_telegram_message result")
    return null
  }

  return {
    chatId: result.chat_id,
    messageId: result.message_id ?? null,
    inserted: result.inserted,
    isDuplicate: result.is_duplicate ?? !result.inserted,
  }
}
