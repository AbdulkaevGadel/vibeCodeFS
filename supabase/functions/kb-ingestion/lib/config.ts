export const workerPipelineVersion = "kb_ingestion_v4"

export type IngestionWorkerConfig = {
  chunkSize: number
  chunkOverlap: number
  maxSweepItems: number
  maxAttempts: number
  staleProcessingSeconds: number
  retryAfterSeconds: number
  heartbeatIntervalMs: number
  hfBatchSize: number
  hfRequestTimeoutMs: number
  embeddingDimension: number
}

export const config: IngestionWorkerConfig = {
  chunkSize: readIntegerEnv("CHUNK_SIZE", 700, 300, 900),
  chunkOverlap: readIntegerEnv("CHUNK_OVERLAP", 120, 0, 400),
  maxSweepItems: readIntegerEnv("MAX_SWEEP_ITEMS", 5, 1, 20),
  maxAttempts: readIntegerEnv("MAX_INGESTION_ATTEMPTS", 3, 1, 10),
  staleProcessingSeconds: readIntegerEnv("STALE_PROCESSING_SECONDS", 300, 30, 3600),
  retryAfterSeconds: readIntegerEnv("RETRY_AFTER_SECONDS", 60, 0, 3600),
  heartbeatIntervalMs: readIntegerEnv("HEARTBEAT_INTERVAL_MS", 15000, 1000, 120000),
  hfBatchSize: readIntegerEnv("HF_EMBEDDING_BATCH_SIZE", 8, 1, 32),
  hfRequestTimeoutMs: readIntegerEnv("HF_REQUEST_TIMEOUT_MS", 30000, 1000, 120000),
  embeddingDimension: 384,
}

function readIntegerEnv(name: string, fallback: number, min: number, max: number) {
  const raw = Deno.env.get(name)

  if (!raw) {
    return fallback
  }

  const value = Number(raw)

  if (!Number.isInteger(value) || value < min || value > max) {
    return fallback
  }

  return value
}
