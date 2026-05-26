import { processClaimedItem } from "./batch-item-processor.ts"
import type { BatchWorkerConfig } from "./config.ts"
import { invokeSelf } from "./function-calls.ts"
import type { RequestPayload } from "./payload.ts"
import { claimNextBatchItem, finishItem } from "./rpc.ts"
import { getErrorMessage } from "./utils.ts"

export async function runWorker(payload: RequestPayload, config: BatchWorkerConfig) {
  const startedAt = Date.now()
  let processed = 0
  let shouldResume = false

  try {
    for (let index = 0; index < config.maxItemsPerInvocation; index += 1) {
      if (Date.now() - startedAt >= config.timeBudgetMs) {
        shouldResume = true
        break
      }

      const processingToken = crypto.randomUUID()
      const claim = await claimNextBatchItem({
        processingToken,
        staleProcessingSeconds: config.staleProcessingSeconds,
        maxAttempts: config.maxAttempts,
      })

      if (claim.type === "empty") {
        shouldResume = false
        break
      }

      if (claim.type !== "claimed") {
        console.log("kb-embedding-refresh-batch claim no-op:", JSON.stringify({
          type: claim.type,
        }))
        continue
      }

      if (payload.batch_id && claim.batch_id !== payload.batch_id) {
        await finishItem(claim, "skipped", "BATCH_MISMATCH", null, "Claimed item belongs to another batch.")
        continue
      }

      await processClaimedItem(claim, config)
      processed += 1
      shouldResume = true
    }

    console.log("kb-embedding-refresh-batch worker finished:", JSON.stringify({
      batch_id: payload.batch_id ?? null,
      processed,
      should_resume: shouldResume,
    }))
  } catch (error) {
    console.error("kb-embedding-refresh-batch worker failed:", getErrorMessage(error))
    shouldResume = true
  }

  if (shouldResume) {
    await invokeSelf(payload.batch_id ?? null)
  }
}
