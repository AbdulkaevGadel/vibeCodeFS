import type { ArticleUnit, TextBlock } from "./types.ts"
import {
  canonicalTitle,
  cleanMarkdownLine,
  isHorizontalRule,
  joinTextUnits,
  normalizeNewlines,
  normalizeUnitText,
  readNumberedStep,
  readSupportSectionLabel,
  readSupportedHeading,
  readUserPhrasesFromLine,
  uniqueStrings,
} from "./text-normalization.ts"
import { formatRetrievalChunk } from "./format-retrieval-chunk.ts"

export function extractArticleUnits(articleTitle: string, content: string) {
  const units: ArticleUnit[] = []
  let currentSection: string | null = null
  let current: TextBlock | null = null

  const flushCurrent = () => {
    if (!current) {
      return
    }

    const text = normalizeUnitText(current.lines.join("\n"))

    if (text) {
      units.push({
        sectionLabel: current.sectionLabel,
        stepLabel: current.stepLabel,
        text,
        userPhrases: uniqueStrings(current.userPhrases),
      })
    }

    current = null
  }

  const beginBlock = (stepLabel: string | null, initialLine: string | null = null, sectionLabel = currentSection) => {
    flushCurrent()
    const nextBlock = {
      sectionLabel,
      stepLabel,
      lines: initialLine ? [initialLine] : [],
      userPhrases: [],
    }

    current = nextBlock

    return nextBlock
  }

  for (const rawLine of normalizeNewlines(content).split("\n")) {
    const trimmed = rawLine.trim()

    if (!trimmed || isHorizontalRule(trimmed)) {
      flushCurrent()
      continue
    }

    if (articleTitle && canonicalTitle(trimmed) === canonicalTitle(articleTitle)) {
      continue
    }

    const headingLabel = readSupportedHeading(trimmed)

    if (headingLabel) {
      flushCurrent()
      currentSection = headingLabel
      continue
    }

    const supportLabel = readSupportSectionLabel(trimmed)

    if (supportLabel) {
      flushCurrent()
      currentSection = supportLabel
      continue
    }

    const numberedStep = readNumberedStep(trimmed)

    if (numberedStep) {
      const stepLine = numberedStep.text
        ? `${numberedStep.label}: ${numberedStep.text}`
        : numberedStep.label

      beginBlock(numberedStep.label, stepLine, null)
      continue
    }

    const cleanLine = cleanMarkdownLine(rawLine)

    if (!cleanLine) {
      continue
    }

    if (!current) {
      current = beginBlock(null)
    }

    const activeBlock = current

    if (!activeBlock) {
      continue
    }

    activeBlock.lines.push(cleanLine)

    for (const phrase of readUserPhrasesFromLine(cleanLine, currentSection)) {
      activeBlock.userPhrases.push(phrase)
    }
  }

  flushCurrent()

  return units
}

export function mergeShortUnits(units: ArticleUnit[], articleTitle: string, targetSize: number) {
  const merged: ArticleUnit[] = []

  for (const unit of units) {
    const previous = merged[merged.length - 1]

    if (
      previous
      && !unit.stepLabel
      && !previous.stepLabel
      && previous.sectionLabel === unit.sectionLabel
      && formatRetrievalChunk(articleTitle, combineUnits(previous, unit)).length <= targetSize
    ) {
      merged[merged.length - 1] = combineUnits(previous, unit)
      continue
    }

    merged.push(unit)
  }

  return merged
}

function combineUnits(left: ArticleUnit, right: ArticleUnit): ArticleUnit {
  return {
    sectionLabel: left.sectionLabel,
    stepLabel: left.stepLabel,
    text: joinTextUnits(left.text, right.text),
    userPhrases: uniqueStrings([...left.userPhrases, ...right.userPhrases]),
  }
}
