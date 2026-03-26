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

  const response = await fetch(`${supabaseUrl}/rest/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      bot_username: botUsername,
      chat_id: chatId,
      user_id: userId,
      username: message.from?.username ?? null,
      first_name: message.from?.first_name ?? null,
      last_name: message.from?.last_name ?? null,
      text,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Supabase insert error ${response.status}: ${errorText}`)
  }
}
