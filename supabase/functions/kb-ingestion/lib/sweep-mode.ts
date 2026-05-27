import type { IngestionWorkerConfig } from "./config.ts"
import type { RequestPayload } from "./payload.ts"
import { claimNextChunkSetForIngestion } from "./rpc.ts"
import { processClaimedChunkSet } from "./claimed-chunk-set.ts"

export async function processSweep(
  payload: RequestPayload,
  config: IngestionWorkerConfig,
  workerPipelineVersion: string,
) {
  const limit = Math.min(payload.limit ?? config.maxSweepItems, config.maxSweepItems)
  const results: Array<Record<string, unknown>> = []

  for (let index = 0; index < limit; index += 1) {
    const ingestionRunId = crypto.randomUUID()
    const processingToken = crypto.randomUUID()

    const claim = await claimNextChunkSetForIngestion({
      processingToken,
      ingestionRunId,
      staleProcessingSeconds: config.staleProcessingSeconds,
      retryAfterSeconds: config.retryAfterSeconds,
      maxAttempts: config.maxAttempts,
    })

    if (claim.type === "empty") {
      results.push({ type: "empty" })
      break
    }

    if (claim.type !== "claimed") {
      results.push({
        type: claim.type,
        ingestion_run_id: ingestionRunId,
      })
      continue
    }

    results.push(await processClaimedChunkSet(claim, config, workerPipelineVersion))
  }

  return {
    ok: true,
    type: "sweep_finished",
    processed: results.filter((result) => result.type !== "empty").length,
    results,
  }
}
