import { buildRetrievalChunks } from "./chunking/index.ts"
import type { IngestionWorkerConfig } from "./config.ts"
import { buildEmbeddedChunks } from "./embedding-batches.ts"
import { getErrorMessage, IngestionError } from "./errors.ts"
import {
  completeChunkSetIngestion,
  failChunkSetIngestion,
  heartbeat,
  type ClaimResult,
} from "./rpc.ts"
import { classifyError, requireString } from "./utils.ts"

export async function processClaimedChunkSet(
  claim: ClaimResult,
  config: IngestionWorkerConfig,
  workerPipelineVersion: string,
) {
  const chunkSetId = requireString(claim.chunk_set_id, "chunk_set_id")
  const processingToken = requireString(claim.processing_token, "processing_token")
  const ingestionRunId = requireString(claim.ingestion_run_id, "ingestion_run_id")
  const chunkSetPipelineVersion = requireString(claim.ingestion_pipeline_version, "ingestion_pipeline_version")

  try {
    if (!claim.article) {
      throw new IngestionError("Article payload is missing", "validation")
    }

    if (chunkSetPipelineVersion !== workerPipelineVersion) {
      throw new IngestionError("PIPELINE_VERSION_MISMATCH", "pipeline_version_mismatch")
    }

    if (claim.embedding_dimension !== config.embeddingDimension) {
      throw new IngestionError("Unexpected embedding dimension", "validation")
    }

    await heartbeat(chunkSetId, processingToken)

    const chunks = buildRetrievalChunks(claim.article.title, claim.article.content, config.chunkSize, config.chunkOverlap)

    if (chunks.length === 0) {
      throw new IngestionError("Article content is empty after chunking", "validation")
    }

    const embeddedChunks = await buildEmbeddedChunks({
      chunks,
      chunkSetId,
      processingToken,
      embeddingModel: claim.embedding_model,
      config,
    })

    const completeResult = await completeChunkSetIngestion({
      chunkSetId,
      processingToken,
      contentChecksum: requireString(claim.content_checksum, "content_checksum"),
      ingestionPipelineVersion: workerPipelineVersion,
      chunks: embeddedChunks,
    })

    if (completeResult.type === "pipeline_version_mismatch") {
      throw new IngestionError("PIPELINE_VERSION_MISMATCH", "pipeline_version_mismatch")
    }

    if (completeResult.type !== "completed") {
      throw new IngestionError(`Completion failed: ${String(completeResult.type)}`, "system")
    }

    console.log("kb-ingestion completed:", JSON.stringify({
      ingestion_run_id: ingestionRunId,
      chunk_set_id: chunkSetId,
      article_id: claim.article_id,
      chunk_count: embeddedChunks.length,
      ingestion_pipeline_version: workerPipelineVersion,
    }))

    return {
      ok: true,
      type: "completed",
      ingestion_run_id: ingestionRunId,
      chunk_set_id: chunkSetId,
      chunk_count: embeddedChunks.length,
      ingestion_pipeline_version: workerPipelineVersion,
    }
  } catch (error) {
    const errorType = classifyError(error)
    const errorMessage = getErrorMessage(error)

    console.error("kb-ingestion failed:", JSON.stringify({
      ingestion_run_id: ingestionRunId,
      chunk_set_id: chunkSetId,
      article_id: claim.article_id,
      error_type: errorType,
      error_message: errorMessage,
    }))

    try {
      await failChunkSetIngestion({
        chunkSetId,
        processingToken,
        errorType,
        errorMessage,
      })
    } catch (failError) {
      console.error("kb-ingestion failed to persist failure:", getErrorMessage(failError))
    }

    return {
      ok: false,
      type: "failed",
      ingestion_run_id: ingestionRunId,
      chunk_set_id: chunkSetId,
      error_type: errorType,
    }
  }
}
