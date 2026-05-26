import type { ArticleUnit } from "./types.ts"
import { formatRetrievalChunk } from "./format-retrieval-chunk.ts"
import { normalizeUnitText } from "./text-normalization.ts"

export function splitLongRetrievalChunk(articleTitle: string, unit: ArticleUnit, chunkSize: number, overlap: number) {
  const chunks: string[] = []
  const contextUnit = {
    ...unit,
    text: "",
  }
  const contextPrefix = formatRetrievalChunk(articleTitle, contextUnit).trim()
  const availableSize = Math.max(200, chunkSize - contextPrefix.length - 2)

  for (const part of hardSplit(unit.text, availableSize, overlap)) {
    const chunk = normalizeUnitText(`${contextPrefix}\n\n${part}`)

    if (chunk.length <= chunkSize || part.length <= availableSize) {
      chunks.push(chunk)
    }
  }

  return chunks
}

function hardSplit(text: string, chunkSize: number, overlap: number) {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = chooseSplitEnd(text, start, chunkSize)
    const chunk = text.slice(start, end).trim()

    if (chunk) {
      chunks.push(chunk)
    }

    if (end === text.length) {
      break
    }

    start = chooseNextSplitStart(text, start, end, overlap)
  }

  return chunks
}

function chooseSplitEnd(text: string, start: number, chunkSize: number) {
  const maxEnd = Math.min(start + chunkSize, text.length)

  if (maxEnd === text.length) {
    return maxEnd
  }

  const minEnd = start + Math.floor(chunkSize * 0.5)
  const sentenceEnd = findLastSentenceEnd(text, start, maxEnd, minEnd)

  if (sentenceEnd) {
    return sentenceEnd
  }

  const whitespaceEnd = findLastWhitespaceEnd(text, start, maxEnd, minEnd)

  if (whitespaceEnd) {
    return whitespaceEnd
  }

  return maxEnd
}

function findLastSentenceEnd(text: string, start: number, maxEnd: number, minEnd: number) {
  for (let index = maxEnd - 1; index >= minEnd; index -= 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if ((char === "." || char === "!" || char === "?") && (!nextChar || /\s/.test(nextChar))) {
      return index + 1
    }
  }

  return null
}

function findLastWhitespaceEnd(text: string, start: number, maxEnd: number, minEnd: number) {
  for (let index = maxEnd - 1; index >= minEnd; index -= 1) {
    if (/\s/.test(text[index])) {
      return index
    }
  }

  return null
}

function chooseNextSplitStart(text: string, previousStart: number, previousEnd: number, overlap: number) {
  if (overlap <= 0) {
    return skipWhitespace(text, previousEnd)
  }

  let nextStart = Math.max(previousStart + 1, previousEnd - overlap)

  while (
    nextStart < previousEnd
    && nextStart > 0
    && !/\s/.test(text[nextStart - 1])
    && !/\s/.test(text[nextStart])
  ) {
    nextStart += 1
  }

  nextStart = skipWhitespace(text, nextStart)

  if (nextStart >= previousEnd) {
    return skipWhitespace(text, previousEnd)
  }

  return nextStart
}

function skipWhitespace(text: string, start: number) {
  let index = start

  while (index < text.length && /\s/.test(text[index])) {
    index += 1
  }

  return index
}
