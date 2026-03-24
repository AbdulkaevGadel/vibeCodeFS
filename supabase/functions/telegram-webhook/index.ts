/// <reference lib="deno.ns" />

type TelegramChat = {
  id?: number
}

type TelegramMessage = {
  text?: string
  chat?: TelegramChat
}

type TelegramUpdate = {
  message?: TelegramMessage
}

const telegramApiBaseUrl = "https://api.telegram.org"

function createSuccessResponse() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

function getReplyText(messageText: string) {
  const normalizedText = messageText.trim()

  if (!normalizedText) {
    return "I got your message."
  }

  return `I got your message: "${normalizedText}". I hear you.`
}

async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
) {
  const response = await fetch(`${telegramApiBaseUrl}/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Telegram API error ${response.status}: ${errorText}`)
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: {
        Allow: "POST",
      },
    })
  }

  try {
    const botToken = Deno.env.get("BOT_TOKEN")

    if (!botToken) {
      console.error("BOT_TOKEN is not configured")
      return createSuccessResponse()
    }

    const update = (await request.json()) as TelegramUpdate
    const chatId = update.message?.chat?.id
    const messageText = update.message?.text ?? ""

    console.log("Incoming Telegram update:", JSON.stringify(update))

    if (!chatId) {
      console.error("Missing chat id in Telegram update")
      return createSuccessResponse()
    }

    const replyText = getReplyText(messageText)
    await sendTelegramMessage(botToken, chatId, replyText)

    return createSuccessResponse()
  } catch (error) {
    console.error("telegram-webhook error:", error)
    return createSuccessResponse()
  }
})
