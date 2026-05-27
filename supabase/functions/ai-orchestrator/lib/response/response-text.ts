import { stripGreetingPrefix } from "../intent/message-text.ts"
import { callRest } from "../rest.ts"

export async function formatAnswerText(chatId: string, answerText: string, triggerMessageText: string) {
  const isFirstAiMessage = await isFirstAiMessageInChat(chatId)
  const finalAnswerText = addGreetingAcknowledgementIfNeeded(answerText, triggerMessageText)

  return formatAiPrefixedText(finalAnswerText, isFirstAiMessage)
}

export async function formatAiReplyText(chatId: string, text: string) {
  const isFirstAiMessage = await isFirstAiMessageInChat(chatId)

  return formatAiPrefixedText(text, isFirstAiMessage)
}

async function isFirstAiMessageInChat(chatId: string) {
  const rows = await callRest<{ id: string }[]>(
    `/rest/v1/chat_messages?chat_id=eq.${encodeURIComponent(chatId)}&sender_type=eq.ai&select=id&limit=1`,
  )

  return rows.length === 0
}

function formatAiPrefixedText(text: string, isFirstAiMessage: boolean) {
  const prefix = isFirstAiMessage
    ? "На связи ИИ-помощник службы поддержки."
    : "ИИ-помощник:"

  return `${prefix}\n${text}`
}

function addGreetingAcknowledgementIfNeeded(answerText: string, triggerMessageText: string) {
  if (!stripGreetingPrefix(triggerMessageText)) {
    return answerText
  }

  if (/^\s*(здравствуйте|добрый день|доброе утро|добрый вечер)\b/iu.test(answerText)) {
    return answerText
  }

  return `Здравствуйте. ${answerText}`
}
