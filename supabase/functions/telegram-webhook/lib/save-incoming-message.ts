import type { TelegramMessage } from "../types/telegram.ts"
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./env.ts"

export async function saveIncomingMessage(
  message: TelegramMessage,
  botUsername: string | null,
) {
  const supabaseUrl = getSupabaseUrl()
  const serviceRoleKey = getSupabaseServiceRoleKey()
  const chatId = message.chat?.id
  const userId = message.from?.id
  const text = message.text?.trim()

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Supabase env is not configured for message persistence")
    return
  }

  if (!chatId || !userId || !text) {
    console.error("Message is missing required fields for database insert")
    return
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
}
