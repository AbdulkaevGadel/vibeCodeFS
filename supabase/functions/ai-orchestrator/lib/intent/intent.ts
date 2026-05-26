import { normalizeIntentText } from "./message-text.ts"
import type { IntentType } from "../types.ts"

type IntentMatch = {
  type: IntentType
}

export function classifyIntent(text: string): IntentMatch | null {
  const normalized = normalizeIntentText(text)

  if (!normalized) {
    return null
  }

  if (isManagerRequestIntent(normalized)) {
    return { type: "manager_request" }
  }

  if (isGreetingOnlyIntent(normalized)) {
    return { type: "greeting" }
  }

  if (isThanksOnlyIntent(normalized)) {
    return { type: "thanks" }
  }

  if (isFarewellOnlyIntent(normalized)) {
    return { type: "farewell" }
  }

  return null
}

function isManagerRequestIntent(text: string) {
  return [
    "позовите оператора",
    "позови оператора",
    "позвать оператора",
    "вызовите оператора",
    "вызови оператора",
    "позовите менеджера",
    "позови менеджера",
    "вызовите менеджера",
    "позовите человека",
    "позови человека",
    "позовите сотрудника",
    "нужен оператор",
    "нужна оператор",
    "нужен менеджер",
    "нужна менеджер",
    "нужен человек",
    "нужен сотрудник",
    "хочу к оператору",
    "хочу к менеджеру",
    "хочу оператора",
    "хочу менеджера",
    "хочу поговорить с оператором",
    "хочу поговорить с менеджером",
    "хочу поговорить с человеком",
    "соедините с оператором",
    "соедините с менеджером",
    "соедините с поддержкой",
    "соедините с человеком",
    "переведите на оператора",
    "переведите на менеджера",
    "переведите в поддержку",
    "передайте оператору",
    "передайте менеджеру",
    "передайте в поддержку",
    "живой оператор",
    "служба поддержки",
  ].some((phrase) => includesIntentPhrase(text, phrase))
}

function isGreetingOnlyIntent(text: string) {
  return [
    "доброе утро",
    "добрый вечер",
    "привет",
    "хай",
    "здравствуйте",
    "здраствуйте",
    "здравствуй",
    "добрый день",
    "доброго дня",
    "доброго времени суток",
  ].includes(text)
}

function isThanksOnlyIntent(text: string) {
  const exactThanks = [
    "спасибо",
    "спасибо большое",
    "большое спасибо",
    "благодарю",
    "спс",
    "спасибо вам",
    "получилось",
    "помогло",
    "сработало",
    "заработало",
    "решено",
    "решилось",
    "вышло",
    "работает",
  ]

  if (exactThanks.includes(text)) {
    return true
  }

  const tokens = text.split(" ").filter(Boolean)
  const thanksTokens = new Set(["спасибо", "спс", "благодарю"])

  if (!tokens.some((token) => thanksTokens.has(token))) {
    return false
  }

  const allowedThanksTokens = new Set([
    "ага",
    "благодарю",
    "большое",
    "вам",
    "все",
    "всё",
    "да",
    "класс",
    "ну",
    "о",
    "окей",
    "ок",
    "отлично",
    "понятно",
    "понял",
    "поняла",
    "принял",
    "приняла",
    "помогло",
    "получилось",
    "работает",
    "решилось",
    "решено",
    "сработало",
    "супер",
    "спасибо",
    "спс",
    "ура",
    "вышло",
    "хорошо",
    "ясно",
    "заработало",
  ])

  return tokens.length > 0 && tokens.every((token) => allowedThanksTokens.has(token))
}

function isFarewellOnlyIntent(text: string) {
  return [
    "до свидания",
    "до свидание",
    "пока",
    "всего доброго",
    "хорошего дня",
    "хорошего вечера",
    "спокойной ночи",
    "до встречи",
    "увидимся",
  ].includes(text)
}

function includesIntentPhrase(text: string, phrase: string) {
  return ` ${text} `.includes(` ${phrase} `)
}
