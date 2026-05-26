import { extractArticleUnits, mergeShortUnits } from "./article-units.ts"
import { formatRetrievalChunk } from "./format-retrieval-chunk.ts"
import { splitLongRetrievalChunk } from "./split-long-chunk.ts"
import { normalizeInlineText } from "./text-normalization.ts"

export function buildRetrievalChunks(title: string, content: string, chunkSize: number, overlap: number) {
  const articleTitle = normalizeInlineText(title)
  const units = extractArticleUnits(articleTitle, content)

  if (units.length === 0) {
    return articleTitle ? [`Article: ${articleTitle}`] : []
  }

  const chunks: string[] = []
  const targetSize = Math.min(chunkSize, 700)
  const hardMaxSize = Math.min(Math.max(chunkSize, 300), 900)

  for (const unit of mergeShortUnits(units, articleTitle, targetSize)) {
    const chunkText = formatRetrievalChunk(articleTitle, unit)

    if (chunkText.length <= hardMaxSize) {
      chunks.push(chunkText)
      continue
    }

    for (const part of splitLongRetrievalChunk(articleTitle, unit, hardMaxSize, overlap)) {
      chunks.push(part)
    }
  }

  return chunks.filter((chunk) => chunk.trim().length > 0)
}
