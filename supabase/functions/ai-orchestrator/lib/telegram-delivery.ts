import { getErrorMessage, OrchestratorError, safeProviderMessage } from "./errors.ts"
import { callRest, callRpc } from "./rest.ts"
import type { PublishResult, ResponseKind } from "./types.ts"

export async function publishAiResponse(
  runId: string,
  processingToken: string,
  responseKind: ResponseKind,
  text: string,
) {
  return await callRpc<PublishResult>("publish_chat_ai_response", {
    p_run_id: runId,
    p_processing_token: processingToken,
    p_response_kind: responseKind,
    p_text: text,
  })
}

export async function deliverPublishedMessage(publishResult: PublishResult) {
  if (!publishResult.message_id || !publishResult.telegram_chat_id || !publishResult.text) {
    throw new OrchestratorError("Publish RPC returned incomplete delivery payload", "system")
  }

  const deliveryResult = await sendTelegramMessage(publishResult.telegram_chat_id, publishResult.text)

  try {
    await updateMessageDeliveryStatus(
      publishResult.message_id,
      deliveryResult.ok ? "sent" : "failed",
      deliveryResult.error,
    )
  } catch (error) {
    console.error("Failed to update AI message delivery status:", getErrorMessage(error))
  }
}

export async function sendTypingAction(chatId: string) {
  try {
    const rows = await callRest<{ telegram_chat_id: number | null }[]>(
      `/rest/v1/chats?id=eq.${encodeURIComponent(chatId)}&select=telegram_chat_id&limit=1`,
    )
    const telegramChatId = rows[0]?.telegram_chat_id

    if (!telegramChatId) {
      return
    }

    const botToken = Deno.env.get("BOT_TOKEN")?.trim()

    if (!botToken) {
      return
    }

    await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramChatId,
        action: "typing",
      }),
    })
  } catch (error) {
    console.error("sendTypingAction failed:", getErrorMessage(error))
  }
}

async function sendTelegramMessage(telegramChatId: number, text: string) {
  const botToken = Deno.env.get("BOT_TOKEN")?.trim()

  if (!botToken) {
    return { ok: false, error: "BOT_TOKEN is not configured" }
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text,
      }),
    })
    const responseText = await response.text()
    const parsed = parseMaybeJson(responseText)

    if (!response.ok || !isTelegramOk(parsed)) {
      const description = isRecord(parsed) && typeof parsed.description === "string"
        ? parsed.description
        : `Telegram API error ${response.status}`

      return { ok: false, error: safeProviderMessage(description) }
    }

    return { ok: true, error: null }
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) }
  }
}

async function updateMessageDeliveryStatus(messageId: string, status: "sent" | "failed", error: string | null) {
  await callRest<unknown>(`/rest/v1/chat_messages?id=eq.${encodeURIComponent(messageId)}&delivery_status=eq.pending`, {
    method: "PATCH",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      delivery_status: status,
      delivery_error: error,
    }),
  })
}

function parseMaybeJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch (_error) {
    return null
  }
}

function isTelegramOk(value: unknown) {
  return isRecord(value) && value.ok === true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
