export const telegramApiBaseUrl = "https://api.telegram.org"

export function buildTelegramBotApiUrl(botToken: string, method: string): string {
  return `${telegramApiBaseUrl}/bot${botToken}/${method}`
}

