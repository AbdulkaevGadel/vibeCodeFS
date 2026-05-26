import type { IngestionWorkerConfig } from "./config.ts"
import type { RequestPayload } from "./payload.ts"
import { claimChunkSetFromWebhook } from "./rpc.ts"
import { processClaimedChunkSet } from "./claimed-chunk-set.ts"

export async function processWebhook(
  payload: RequestPayload,
  config: IngestionWorkerConfig,
  workerPipelineVersion: string,
) {
  const ingestionRunId = crypto.randomUUID()
  const processingToken = crypto.randomUUID()

  const claim = await claimChunkSetFromWebhook({
    chunkSetId: payload.chunk_set_id,
    processingToken,
    ingestionRunId,
  })

  if (claim.type !== "claimed") {
    console.log("kb-ingestion webhook no-op:", JSON.stringify({
      ingestion_run_id: ingestionRunId,
      chunk_set_id: payload.chunk_set_id,
      type: claim.type,
    }))

    return {
      ok: true,
      type: claim.type,
      ingestion_run_id: ingestionRunId,
      chunk_set_id: payload.chunk_set_id,
    }
  }

  return await processClaimedChunkSet(claim, config, workerPipelineVersion)
}
