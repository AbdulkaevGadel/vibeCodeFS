import type { BatchWorkerConfig } from "./config.ts"
import { readChunkSetStatus, type ChunkSetStatusResult } from "./rpc.ts"
import { delay } from "./utils.ts"

export async function waitForChunkSetTerminalStatus(chunkSetId: string, config: BatchWorkerConfig) {
  let lastStatus: ChunkSetStatusResult = { type: "not_checked" }

  for (let attempt = 0; attempt < config.processingPostCheckAttempts; attempt += 1) {
    lastStatus = await readChunkSetStatus(chunkSetId)

    if (lastStatus.type !== "ok") {
      return lastStatus
    }

    if (lastStatus.status !== "processing" && lastStatus.status !== "pending") {
      return lastStatus
    }

    await delay(config.processingPostCheckDelayMs)
  }

  return lastStatus
}
