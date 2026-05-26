import { formatAiReplyText } from "../response/response-text.ts"
import type { IntentType, ResponseBranch } from "../types.ts"

export async function buildIntentResponseBranch(chatId: string, intentType: IntentType): Promise<ResponseBranch> {
  if (intentType === "manager_request") {
    return {
      kind: "handoff",
      text: await formatAiReplyText(chatId, "Передаю чат оператору службы поддержки."),
    }
  }

  const replyByIntent: Record<Exclude<IntentType, "manager_request">, string> = {
    greeting: "Здравствуйте. Опишите, пожалуйста, ваш вопрос, и я постараюсь помочь.",
    thanks: "Пожалуйста. Если появится ещё вопрос, напишите здесь.",
    farewell: "До свидания. Если понадобится помощь, напишите здесь.",
  }

  return {
    kind: "intent_reply",
    text: await formatAiReplyText(chatId, replyByIntent[intentType]),
  }
}
