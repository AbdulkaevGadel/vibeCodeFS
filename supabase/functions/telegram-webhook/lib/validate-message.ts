import type { TelegramMessage } from "../types/telegram.ts"

type PersistableTelegramMessage = TelegramMessage & {
  chat: {
    id: number
  }
  from: {
    id: number
    username?: string
    first_name?: string
    last_name?: string
  }
  text: string
}

export function canReplyToMessage(message: TelegramMessage | undefined): message is TelegramMessage & {
  chat: {
    id: number
  }
} {
  return Boolean(message?.chat?.id)
}

export function canPersistMessage(
  message: TelegramMessage | undefined,
): message is PersistableTelegramMessage {
  const chatId = message?.chat?.id
  const userId = message?.from?.id
  const text = message?.text?.trim()

  return Boolean(chatId && userId && text)
}
