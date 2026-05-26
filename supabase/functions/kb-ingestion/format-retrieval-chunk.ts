import type { ArticleUnit } from "./chunking-types.ts"
import { extractKeywords, inferCustomerIntent, inferIntent } from "./intent.ts"
import { isReadyAnswerSection, isWarningSection, normalizeUnitText } from "./text-normalization.ts"

export function formatRetrievalChunk(articleTitle: string, unit: ArticleUnit) {
  const lines: string[] = []

  if (articleTitle && shouldIncludeArticleTitle(unit)) {
    lines.push(`Статья: ${articleTitle}`)
  }

  if (unit.sectionLabel) {
    lines.push(`Раздел: ${unit.sectionLabel}`)
  }

  if (unit.stepLabel) {
    lines.push(`Шаг: ${unit.stepLabel}`)
  }

  const intent = inferIntent(articleTitle, unit)

  if (intent) {
    lines.push(`Намерение: ${intent}`)
  }

  if (unit.userPhrases.length > 0) {
    const customerIntent = inferCustomerIntent(articleTitle, unit)

    if (customerIntent) {
      lines.push(customerIntent)
    }

    lines.push("Фразы клиента:")
    lines.push(...unit.userPhrases.map((phrase) => `- ${phrase}`))
  }

  const keywords = shouldIncludeKeywords(unit)
    ? extractKeywords([articleTitle, unit.sectionLabel ?? "", unit.text, ...unit.userPhrases].join(" "))
    : []

  if (keywords.length > 0) {
    lines.push(`Ключевые слова: ${keywords.join(", ")}`)
  }

  lines.push("")
  lines.push(unit.text)

  return normalizeUnitText(lines.join("\n"))
}

function shouldIncludeArticleTitle(unit: ArticleUnit) {
  return !isWarningSection(unit.sectionLabel)
}

function shouldIncludeKeywords(unit: ArticleUnit) {
  return !isWarningSection(unit.sectionLabel) && !isReadyAnswerSection(unit.sectionLabel)
}
