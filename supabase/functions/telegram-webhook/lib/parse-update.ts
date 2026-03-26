import type { TelegramUpdate } from "../types/telegram.ts"

export function parseUpdate(update: TelegramUpdate) {
  const message = update.message
  const chatId = message?.chat?.id ?? null
  const messageText = message?.text ?? ""

  return {
    message,
    chatId,
    messageText,
  }
}
