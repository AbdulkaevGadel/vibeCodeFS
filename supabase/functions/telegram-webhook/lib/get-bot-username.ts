import { telegramApiBaseUrl } from "./constants.ts"

let cachedBotUsername: string | null = null

export async function getBotUsername(botToken: string) {
  if (cachedBotUsername) {
    return cachedBotUsername
  }

  const response = await fetch(`${telegramApiBaseUrl}/bot${botToken}/getMe`)

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Telegram getMe error ${response.status}: ${errorText}`)
  }

  const data = (await response.json()) as {
    ok?: boolean
    result?: {
      username?: string
    }
  }

  cachedBotUsername = data.result?.username ?? null
  return cachedBotUsername
}
