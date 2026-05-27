import type { IngestionWorkerConfig } from "./config.ts"
import { fetchEmbeddings, isEmbedding } from "./embeddings.ts"
import { IngestionError } from "./errors.ts"
import { heartbeat, type ChunkPayload } from "./rpc.ts"
import { requireString } from "./utils.ts"

export async function buildEmbeddedChunks(options: {
  chunks: string[]
  chunkSetId: string
  processingToken: string
  embeddingModel: string | undefined
  config: IngestionWorkerConfig
}) {
  const embeddedChunks: ChunkPayload[] = []
  let lastHeartbeatAt = Date.now()

  for (let start = 0; start < options.chunks.length; start += options.config.hfBatchSize) {
    if (Date.now() - lastHeartbeatAt >= options.config.heartbeatIntervalMs) {
      await heartbeat(options.chunkSetId, options.processingToken)
      lastHeartbeatAt = Date.now()
    }

    const batch = options.chunks.slice(start, start + options.config.hfBatchSize)
    const embeddings = await fetchEmbeddings(requireString(options.embeddingModel, "embedding_model"), batch, {
      embeddingDimension: options.config.embeddingDimension,
      requestTimeoutMs: options.config.hfRequestTimeoutMs,
    })

    if (embeddings.length !== batch.length) {
      throw new IngestionError("Embedding batch size mismatch", "external")
    }

    for (let offset = 0; offset < batch.length; offset += 1) {
      const embedding = embeddings[offset]

      if (!isEmbedding(embedding, options.config.embeddingDimension)) {
        throw new IngestionError("Invalid embedding dimension", "external")
      }

      embeddedChunks.push({
        chunk_index: start + offset,
        chunk_text: batch[offset],
        embedding,
      })
    }

    await heartbeat(options.chunkSetId, options.processingToken)
    lastHeartbeatAt = Date.now()
  }

  return embeddedChunks
}
