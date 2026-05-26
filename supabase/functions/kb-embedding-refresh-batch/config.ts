export type BatchWorkerConfig = {
  maxItemsPerInvocation: number
  staleProcessingSeconds: number
  maxAttempts: number
  timeBudgetMs: number
  processingPostCheckAttempts: number
  processingPostCheckDelayMs: number
}

export const config: BatchWorkerConfig = {
  maxItemsPerInvocation: readIntegerEnv("KB_BATCH_MAX_ITEMS", 5, 1, 20),
  staleProcessingSeconds: readIntegerEnv("KB_BATCH_STALE_PROCESSING_SECONDS", 600, 60, 3600),
  maxAttempts: readIntegerEnv("KB_BATCH_MAX_ATTEMPTS", 3, 1, 10),
  timeBudgetMs: readIntegerEnv("KB_BATCH_TIME_BUDGET_MS", 250000, 10000, 360000),
  processingPostCheckAttempts: readIntegerEnv("KB_BATCH_POST_CHECK_ATTEMPTS", 6, 1, 20),
  processingPostCheckDelayMs: readIntegerEnv("KB_BATCH_POST_CHECK_DELAY_MS", 2000, 250, 10000),
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
