import type { TelegramUpdate } from "./types/telegram.ts"
import {createSuccessResponse} from "./lib/create-success-response.ts";
import {getBotUsername} from "./lib/get-bot-username.ts";
import {parseUpdate} from "./lib/parse-update.ts";
import {getBotToken} from "./lib/env.ts";
import {canPersistMessage, canReplyToMessage} from "./lib/validate-message.ts";
import {saveIncomingMessage} from "./lib/save-incoming-message.ts";
import {getReplyText} from "./lib/get-reply-text.ts";
import {sendTelegramMessage} from "./lib/send-telegram-message.ts";

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
    const botToken = getBotToken()

    if (!botToken) {
      console.error("BOT_TOKEN is not configured")
      return createSuccessResponse()
    }

    const update = (await request.json()) as TelegramUpdate
    const { message, chatId, messageText } = parseUpdate(update)

    console.log("Incoming Telegram update:", JSON.stringify(update))

    if (!canReplyToMessage(message) || !chatId) {
      console.error("Missing chat id in Telegram update")
      return createSuccessResponse()
    }

    if (canPersistMessage(message)) {
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
