export function normalizeNewlines(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
}

export function canonicalTitle(text: string) {
  return stripBlockquoteMarker(text)
    .replace(/^#+\s*/, "")
    .replace(/:+\s*$/, "")
    .replace(/\*\*/g, "")
    .replace(/[ \t]+/g, " ")
    .trim()
    .toLowerCase()
}

export function isHorizontalRule(text: string) {
  return /^-{3,}$/.test(text.trim())
}

export function readSupportedHeading(text: string) {
  const match = text.match(/^#{1,3}\s+(.+)$/)

  if (!match) {
    return null
  }

  return normalizeSectionLabel(cleanMarkdownLine(match[1]))
}

export function readSupportSectionLabel(text: string) {
  const cleaned = cleanSectionLine(text)
  const withoutColon = cleaned.replace(/[:：]\s*$/, "").trim()
  const canonical = withoutColon.toLowerCase()

  const knownLabels: Record<string, string> = {
    "когда использовать": "Когда использовать",
    "когда применять": "Когда использовать",
    "фразы клиента": "Фразы клиента",
    "что пишет клиент": "Фразы клиента",
    "что нужно сделать": "Что нужно сделать",
    "шаги": "Что нужно сделать",
    "важно": "Важно",
    "готовый ответ": "Готовый ответ клиенту",
    "готовый ответ клиенту": "Готовый ответ клиенту",
    "ответ клиенту": "Готовый ответ клиенту",
    "эскалация": "Эскалация",
    "когда эскалировать": "Эскалация",
  }

  return knownLabels[canonical] ?? null
}

export function normalizeSectionLabel(text: string) {
  const supportLabel = readSupportSectionLabel(text)

  if (supportLabel) {
    return supportLabel
  }

  return cleanSectionLine(text).replace(/[:：]\s*$/, "").trim()
}

export function readNumberedStep(text: string) {
  const match = stripBlockquoteMarker(text)
    .trim()
    .match(/^(\d{1,2})[.)]\s+(.+)$/)

  if (!match) {
    return null
  }

  return {
    label: `Step ${match[1]}`,
    text: cleanMarkdownLine(match[2]),
  }
}

export function readUserPhrasesFromLine(text: string, sectionLabel: string | null) {
  if (!sectionLabel || !isUserPhraseSection(sectionLabel)) {
    return []
  }

  const phrase = text
    .replace(/^["'«»]+|["'«»]+$/g, "")
    .replace(/[.;]+$/g, "")
    .trim()

  if (
    !phrase
    || phrase.length > 120
    || /[:：]$/.test(phrase)
    || /^если\s+клиент\s+пишет/i.test(phrase)
  ) {
    return []
  }

  return [phrase]
}

export function isUserPhraseSection(sectionLabel: string | null) {
  return sectionLabel === "Когда использовать" || sectionLabel === "Фразы клиента"
}

export function isWarningSection(sectionLabel: string | null) {
  return sectionLabel === "Важно"
}

export function isReadyAnswerSection(sectionLabel: string | null) {
  return sectionLabel === "Готовый ответ клиенту"
}

export function uniqueStrings(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = normalizeInlineText(value)
    const key = normalized.toLowerCase()

    if (!normalized || seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(normalized)
  }

  return result
}

export function cleanMarkdownLine(line: string) {
  let text = stripBlockquoteMarker(line.trim()).trim()

  if (!text || isHorizontalRule(text)) {
    return ""
  }

  text = text.replace(/^#+\s*/, "")
  text = text.replace(/^[-*+]\s+/, "")
  text = text.replace(/\*\*/g, "")
  text = text.replace(/[ \t]+/g, " ")

  return text.trim()
}

export function cleanSectionLine(line: string) {
  return cleanMarkdownLine(line)
    .replace(/^[^0-9A-Za-zА-Яа-яЁё]+/, "")
    .replace(/[ \t]+/g, " ")
    .trim()
}

export function normalizeInlineText(text: string) {
  return text.replace(/[ \t]+/g, " ").trim()
}

export function stripBlockquoteMarker(text: string) {
  return text.replace(/^(>\s*)+/, "")
}

export function normalizeUnitText(text: string) {
  return normalizeNewlines(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim()
}

export function joinTextUnits(left: string, right: string) {
  return `${left.trim()}\n\n${right.trim()}`.trim()
}
