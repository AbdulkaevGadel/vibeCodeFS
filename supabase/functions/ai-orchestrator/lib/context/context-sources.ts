import { config } from "../config.ts"
import { callRest } from "../rest.ts"
import type { KbFragment, RetrievalChunk, TriggerMessage } from "../types.ts"
import { firstRelation, truncateText } from "../utils.ts"

export type ChatMessageRow = {
  id: string
  chat_id: string
  text: string
  sender_type: "client" | "manager" | "ai" | "system"
  created_at: string
}

type KnowledgeChunkRow = {
  id: string
  article_id: string
  chunk_set_id: string
  chunk_index: number
  chunk_text: string
  content_checksum: string | null
  embedding_status: string
  ingestion_pipeline_version: string | null
  knowledge_chunk_sets?: KnowledgeChunkSetRow | KnowledgeChunkSetRow[]
  knowledge_base_articles?: KnowledgeArticleRow | KnowledgeArticleRow[]
}

type KnowledgeChunkSetRow = {
  status: string
  is_active: boolean
  content_checksum: string | null
  ingestion_pipeline_version: string | null
}

type KnowledgeArticleRow = {
  status: string
  title: string | null
  slug: string | null
}

export async function fetchRecentHistory(triggerMessage: TriggerMessage): Promise<ChatMessageRow[]> {
  const oldestHistoryDate = new Date(triggerMessage.created_at)
  oldestHistoryDate.setHours(oldestHistoryDate.getHours() - config.context.maxHistoryAgeHours)

  const query = [
    `chat_id=eq.${encodeURIComponent(triggerMessage.chat_id)}`,
    `created_at=gte.${encodeURIComponent(oldestHistoryDate.toISOString())}`,
    `created_at=lte.${encodeURIComponent(triggerMessage.created_at)}`,
    `id=neq.${encodeURIComponent(triggerMessage.id)}`,
    "sender_type=in.(client,ai)",
    "select=id,chat_id,text,sender_type,created_at",
    "order=created_at.desc,id.desc",
    "limit=24",
  ].join("&")

  const rows = await callRest<ChatMessageRow[]>(`/rest/v1/chat_messages?${query}`)
  const selected: ChatMessageRow[] = []
  let clientCount = 0
  let aiCount = 0

  for (const row of rows) {
    if (selected.length >= config.context.maxHistoryMessages) {
      break
    }

    if (row.sender_type === "client") {
      if (clientCount >= config.context.maxClientHistoryMessages) {
        continue
      }

      clientCount += 1
      selected.push(row)
      continue
    }

    if (row.sender_type === "ai") {
      if (aiCount >= config.context.maxAiHistoryMessages) {
        continue
      }

      aiCount += 1
      selected.push(row)
    }
  }

  return selected.reverse()
}

export async function fetchKbFragments(retrievalChunks: RetrievalChunk[]): Promise<KbFragment[]> {
  const requestedChunks = retrievalChunks.slice(0, config.context.maxKbFragments)
  const chunkIds = requestedChunks.map((chunk) => chunk.chunk_id)

  if (chunkIds.length === 0) {
    return []
  }

  const query = [
    `id=in.(${chunkIds.map(encodeURIComponent).join(",")})`,
    "select=id,article_id,chunk_set_id,chunk_index,chunk_text,content_checksum,embedding_status,ingestion_pipeline_version,knowledge_chunk_sets!inner(status,is_active,content_checksum,ingestion_pipeline_version),knowledge_base_articles!inner(status,title,slug)",
  ].join("&")

  const rows = await callRest<KnowledgeChunkRow[]>(`/rest/v1/knowledge_chunks?${query}`)
  const rowsById = new Map(rows.map((row) => [row.id, row]))
  const fragments: KbFragment[] = []

  for (const retrievalChunk of requestedChunks) {
    const row = rowsById.get(retrievalChunk.chunk_id)

    if (!row) {
      continue
    }

    const chunkSet = firstRelation(row.knowledge_chunk_sets)
    const article = firstRelation(row.knowledge_base_articles)

    if (!chunkSet || !article) {
      continue
    }

    if (
      chunkSet.is_active !== true
      || chunkSet.status !== "completed"
      || row.embedding_status !== "completed"
      || article.status !== "published"
    ) {
      continue
    }

    const truncatedText = truncateText(row.chunk_text, config.context.maxKbFragmentChars)

    fragments.push({
      chunk_id: row.id,
      article_id: row.article_id,
      chunk_set_id: row.chunk_set_id,
      chunk_index: row.chunk_index,
      similarity_score: retrievalChunk.similarity_score,
      article_title: article.title,
      article_slug: article.slug,
      content_checksum: row.content_checksum ?? chunkSet.content_checksum,
      ingestion_pipeline_version: row.ingestion_pipeline_version ?? chunkSet.ingestion_pipeline_version,
      text: truncatedText.text,
      truncated: truncatedText.truncated,
    })
  }

  return fragments
}
