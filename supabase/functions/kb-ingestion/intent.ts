import type { ArticleUnit } from "./chunking-types.ts"
import { isReadyAnswerSection, isWarningSection, uniqueStrings } from "./text-normalization.ts"

export function inferIntent(articleTitle: string, unit: ArticleUnit) {
  const unitSource = [unit.sectionLabel ?? "", unit.stepLabel ?? "", unit.text, ...unit.userPhrases].join(" ").toLowerCase()
  const source = [articleTitle, unitSource].join(" ").toLowerCase()

  if (isWarningSection(unit.sectionLabel)) {
    return "правила безопасности"
  }

  if (isReadyAnswerSection(unit.sectionLabel)) {
    return "готовый ответ клиенту"
  }

  if (/эскалац|оператор|менеджер|поддержк/.test(unitSource)) {
    return "передача обращения оператору"
  }

  if (/возврат|вернуть|refund/.test(unitSource)) {
    return "возврат средств"
  }

  if (/оплат|плат[её]ж|карт|деньг|списал/.test(source)) {
    return "клиент не может оплатить заказ"
  }

  return null
}

export function inferCustomerIntent(articleTitle: string, unit: ArticleUnit) {
  const source = [articleTitle, unit.text, ...unit.userPhrases].join(" ").toLowerCase()

  if (/оплат|плат[её]ж|карт/.test(source)) {
    return "Клиент не может оплатить картой или сообщает об ошибке платежа."
  }

  if (/деньг|списал/.test(source)) {
    return "Клиент сообщает, что деньги списались или платёж завис."
  }

  return null
}

export function extractKeywords(text: string) {
  const normalized = text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9\s-]/g, " ")

  const words = normalized
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !isStopWord(word))

  const keywordStems = [
    "оплат",
    "платеж",
    "карт",
    "деньг",
    "спис",
    "ошиб",
    "заказ",
    "возврат",
    "оператор",
    "эскалац",
    "поддерж",
    "cvv",
  ]

  const keywords: string[] = []

  for (const stem of keywordStems) {
    const word = words.find((item) => item.includes(stem))

    if (word) {
      keywords.push(word)
    }
  }

  return uniqueStrings(keywords).slice(0, 8)
}

function isStopWord(word: string) {
  return [
    "если",
    "когда",
    "нужно",
    "можно",
    "клиент",
    "клиента",
    "клиенту",
    "использовать",
    "проверить",
    "уточнить",
    "который",
    "другие",
    "после",
    "перед",
    "через",
    "this",
    "that",
    "with",
  ].includes(word)
}
