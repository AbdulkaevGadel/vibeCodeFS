export function normalizeIntentText(text: string) {
  return text
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function stripGreetingPrefix(text: string) {
  const normalizedInput = normalizeIntentText(text)
  const greetingPrefixes = [
    "доброго времени суток",
    "доброе утро",
    "добрый вечер",
    "добрый день",
    "доброго дня",
    "здравствуйте",
    "здравствуй",
    "привет",
  ]
  const matchedPrefix = greetingPrefixes.find((prefix) => {
    return normalizedInput === prefix || normalizedInput.startsWith(`${prefix} `)
  })

  if (!matchedPrefix || normalizedInput === matchedPrefix) {
    return null
  }

  const patternText = matchedPrefix
    .replace(/\s+/g, String.raw`\s+`)
  const prefixPattern = new RegExp(String.raw`^\s*${patternText}[\s,!.:;?-]+`, "iu")
  const cleaned = text.replace(prefixPattern, "").trim()

  if (!cleaned || normalizeIntentText(cleaned) === normalizeIntentText(text)) {
    return null
  }

  return cleaned
}

export function getRetrievalQueryText(text: string) {
  const trimmed = text.trim()
  const withoutGreetingPrefix = stripGreetingPrefix(trimmed)

  return withoutGreetingPrefix || trimmed
}
