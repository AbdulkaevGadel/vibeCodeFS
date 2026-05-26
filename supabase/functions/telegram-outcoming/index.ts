import { createClient } from "@supabase/supabase-js"
import { requirePost } from "../_shared/http/method.ts"
import { jsonResponse } from "../_shared/http/responses.ts"
import { validateInternalSecret } from "../_shared/internal-auth/internal-secret.ts"
import { getRequiredSupabaseServiceRoleConfig } from "../_shared/supabase/env.ts"
import { buildTelegramBotApiUrl } from "../_shared/telegram/api.ts"

type TelegramOutgoingPayload = {
  message_id?: string
  telegram_chat_id?: number | string
  text?: string
  is_duplicate?: boolean
}

type TelegramSendMessageResponse = {
  ok?: boolean
  description?: string
}

function getBotToken(): string {
  const botToken = Deno.env.get("BOT_TOKEN")?.trim()

  if (!botToken) {
    throw new Error("BOT_TOKEN is not configured")
  }

  return botToken
}

Deno.serve(async (req) => {
  const methodError = requirePost(req)

  if (methodError) {
    return methodError
  }

  try {
    const internalSecretResult = validateInternalSecret(req)

    console.log("telegram-outcoming invoke received")

    if (!internalSecretResult.ok) {
      console.error("Unauthorized telegram-outcoming request:", internalSecretResult.reason)
      return new Response("Unauthorized", { status: 401 })
    }

    const payload = (await req.json()) as TelegramOutgoingPayload
    const { message_id, telegram_chat_id, text, is_duplicate } = payload

    console.log("telegram-outcoming payload received:", JSON.stringify({
      message_id,
      telegram_chat_id,
      is_duplicate: Boolean(is_duplicate),
      has_text: Boolean(text),
    }))

    if (is_duplicate) {
      console.log(`Duplicate message detected for message_id=${message_id}, skipping Telegram send.`)
      return jsonResponse({ ok: true, delivery_status: "sent", duplicate: true })
    }

    if (!message_id || !telegram_chat_id || !text) {
      return new Response("Missing required fields", { status: 400 })
    }

    const botToken = getBotToken()
    const { supabaseUrl, serviceRoleKey } = getRequiredSupabaseServiceRoleConfig()
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    let deliveryStatus = "sent"
    let deliveryError = null

    console.log(`Sending message to Telegram: chat_id=${telegram_chat_id}, message_id=${message_id}`)

    const tgResponse = await fetch(buildTelegramBotApiUrl(botToken, "sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegram_chat_id,
        text: text,
      }),
    })

    const tgData = (await tgResponse.json()) as TelegramSendMessageResponse

    if (!tgResponse.ok || !tgData.ok) {
      deliveryStatus = "failed"
      deliveryError = tgData.description || `Telegram API error ${tgResponse.status}`
      console.error("Telegram error:", tgData)
    }

    const { error: updateError } = await supabase
      .from("chat_messages")
      .update({
        delivery_status: deliveryStatus,
        delivery_error: deliveryError,
      })
      .eq("id", message_id)
      .eq("delivery_status", "pending")

    if (updateError) {
      console.error("Database update error:", updateError)
    }

    return jsonResponse({ ok: true, delivery_status: deliveryStatus })
  } catch (error) {
    console.error("telegram-outcoming error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"

    return jsonResponse({ error: errorMessage }, 500)
  }
})
