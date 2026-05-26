import { waitForChunkSetTerminalStatus } from "./chunk-set-status.ts"
import type { BatchWorkerConfig } from "./config.ts"
import { invokeKbIngestion } from "./function-calls.ts"
import {
  finishItem,
  requestEmbeddingRefresh,
  type ClaimResult,
  type RefreshResult,
} from "./rpc.ts"
import { getErrorMessage, requireString } from "./utils.ts"

export async function processClaimedItem(claim: ClaimResult, config: BatchWorkerConfig) {
  const itemId = requireString(claim.item_id, "item_id")
  const processingToken = requireString(claim.processing_token, "processing_token")

  try {
    const refresh = await requestEmbeddingRefresh(itemId, processingToken)
    await finishByRefreshResult(claim, refresh, config)
  } catch (error) {
    console.error("kb-embedding-refresh-batch item failed:", JSON.stringify({
      item_id: itemId,
      batch_id: claim.batch_id,
      article_id: claim.article_id,
      error_message: getErrorMessage(error),
    }))

    await finishItem(claim, "failed", "WORKER_ERROR", null, getErrorMessage(error))
  }
}

async function finishByRefreshResult(
  claim: ClaimResult,
  refresh: RefreshResult,
  config: BatchWorkerConfig,
) {
  if (refresh.type === "queued" || refresh.type === "retry_queued") {
    await finishQueuedRefresh(claim, refresh, config)
    return
  }

  if (refresh.type === "already_actual") {
    await finishItem(claim, "skipped", "ALREADY_ACTUAL", refresh.chunk_set_id ?? null, null)
    return
  }

  if (refresh.type === "already_updating") {
    await finishItem(claim, "skipped", "ALREADY_UPDATING", refresh.chunk_set_id ?? null, null)
    return
  }

  if (refresh.type === "skipped") {
    await finishItem(claim, "skipped", refresh.result_type ?? "SKIPPED", refresh.chunk_set_id ?? null, null)
    return
  }

  if (refresh.type === "unavailable") {
    await finishItem(
      claim,
      "failed",
      refresh.result_type ?? "EMBEDDINGS_UNAVAILABLE",
      refresh.chunk_set_id ?? null,
      refresh.result_type ?? "Embeddings are unavailable for this article.",
    )
    return
  }

  await finishItem(
    claim,
    "failed",
    `UNEXPECTED_REFRESH_RESULT_${refresh.type.toUpperCase()}`,
    refresh.chunk_set_id ?? null,
    `Unexpected refresh result: ${refresh.type}`,
  )
}

async function finishQueuedRefresh(
  claim: ClaimResult,
  refresh: RefreshResult,
  config: BatchWorkerConfig,
) {
  const chunkSetId = requireString(refresh.chunk_set_id, "chunk_set_id")
  const ingestion = await invokeKbIngestion(chunkSetId)

  if (ingestion.ok === true && ingestion.type === "completed") {
    await finishItem(claim, "completed", refresh.type, chunkSetId, null)
    return
  }

  if (ingestion.type === "not_claimed") {
    const chunkSetStatus = await waitForChunkSetTerminalStatus(chunkSetId, config)

    if (chunkSetStatus.type === "ok" && chunkSetStatus.status === "completed" && chunkSetStatus.is_active === true) {
      await finishItem(claim, "completed", "INGESTION_ALREADY_COMPLETED", chunkSetId, null)
      return
    }

    if (chunkSetStatus.type === "ok" && chunkSetStatus.status === "processing") {
      await finishItem(claim, "skipped", "INGESTION_ALREADY_PROCESSING", chunkSetId, null)
      return
    }
  }

  await finishItem(
    claim,
    "failed",
    `INGESTION_${String(ingestion.type ?? "FAILED").toUpperCase()}`,
    chunkSetId,
    `kb-ingestion failed with type ${String(ingestion.type ?? "unknown")}`,
  )
}
