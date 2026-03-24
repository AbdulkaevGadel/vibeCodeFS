/// <reference lib="deno.ns" />

type TelegramChat = {
  id?: number
}

type TelegramUser = {
  id?: number
  username?: string
  first_name?: string
  last_name?: string
}

type TelegramMessage = {
  text?: string
  chat?: TelegramChat
  from?: TelegramUser
}

type TelegramUpdate = {
  message?: TelegramMessage
}

const telegramApiBaseUrl = "https://api.telegram.org"
let cachedBotUsername: string | null = null

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

function getSupabaseUrl() {
  return Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")
}

async function getBotUsername(botToken: string) {
  if (cachedBotUsername) {
    return cachedBotUsername
  }

  const response = await fetch(`${telegramApiBaseUrl}/bot${botToken}/getMe`)

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Telegram getMe error ${response.status}: ${errorText}`)
  }

  const data = await response.json() as {
    ok?: boolean
    result?: {
      username?: string
    }
  }

  cachedBotUsername = data.result?.username ?? null
  return cachedBotUsername
}

async function saveIncomingMessage(message: TelegramMessage, botUsername: string | null) {
  const supabaseUrl = getSupabaseUrl()
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
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
    const message = update.message
    const chatId = message?.chat?.id
    const messageText = message?.text ?? ""

    console.log("Incoming Telegram update:", JSON.stringify(update))

    if (!chatId) {
      console.error("Missing chat id in Telegram update")
      return createSuccessResponse()
    }

    if (message) {
      const botUsername = await getBotUsername(botToken)
      await saveIncomingMessage(message, botUsername)
    }

    const replyText = getReplyText(messageText)
    await sendTelegramMessage(botToken, chatId, replyText)

    return createSuccessResponse()
  } catch (error) {
    console.error("telegram-webhook error:", error)
    return createSuccessResponse()
  }
})
