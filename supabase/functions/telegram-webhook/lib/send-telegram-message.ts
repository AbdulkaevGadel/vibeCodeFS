import { buildTelegramBotApiUrl } from "../../_shared/telegram/api.ts"

export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
) {
  const response = await fetch(buildTelegramBotApiUrl(botToken, "sendMessage"), {
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
