export const config = {
  promptVersion: "phase-9-context-prompt-v1",
  retrieval: {
    enabled: true,
    matchThreshold: readNumberEnv("RETRIEVAL_MATCH_THRESHOLD", 0.60, 0, 1),
    matchCount: readIntegerEnv("RETRIEVAL_MATCH_COUNT", 5, 1, 20),
    candidateCount: readIntegerEnv("RETRIEVAL_CANDIDATE_COUNT", 50, 5, 200),
    stageTimeoutMs: readIntegerEnv("AI_RETRIEVAL_STAGE_TIMEOUT_MS", 45000, 3000, 120000),
    embeddingProvider: "huggingface",
    embeddingModel: "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    embeddingDimension: 384,
    embeddingMaxProviderRetries: readIntegerEnv("HF_EMBEDDING_MAX_PROVIDER_RETRIES", 1, 0, 3),
  },
  context: {
    enabled: true,
    builderVersion: "context-builder-v1",
    maxHistoryMessages: 8,
    maxClientHistoryMessages: 4,
    maxAiHistoryMessages: 4,
    maxHistoryAgeHours: 24,
    maxHistoryMessageChars: 800,
    maxKbFragments: 5,
    maxKbFragmentChars: 1200,
    maxPromptChars: 9000,
    maxCurrentMessageChars: 2000,
  },
  llm: {
    provider: "huggingface",
    model: Deno.env.get("LLM_MODEL")?.trim() || "Qwen/Qwen2.5-7B-Instruct-1M:cheapest",
    endpoint: Deno.env.get("LLM_ENDPOINT")?.trim() || "https://router.huggingface.co/v1/chat/completions",
    requestTimeoutMs: readIntegerEnv("LLM_REQUEST_TIMEOUT_MS", 20000, 1000, 60000),
    maxProviderRetries: readIntegerEnv("LLM_MAX_PROVIDER_RETRIES", 1, 0, 3),
    maxOutputTokens: readIntegerEnv("LLM_MAX_OUTPUT_TOKENS", 500, 100, 2000),
    temperature: readNumberEnv("LLM_TEMPERATURE", 0.2, 0, 2),
  },
  behavior: {
    mode: "ai_reply",
  },
  staleRunRecovery: {
    enabled: true,
    staleAfterMinutes: readIntegerEnv("AI_STALE_RUN_RECOVERY_MINUTES", 10, 1, 120),
    limit: readIntegerEnv("AI_STALE_RUN_RECOVERY_LIMIT", 20, 1, 100),
  },
  hfRequestTimeoutMs: readIntegerEnv("HF_REQUEST_TIMEOUT_MS", 30000, 1000, 120000),
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

function readNumberEnv(name: string, fallback: number, min: number, max: number) {
  const raw = Deno.env.get(name)

  if (!raw) {
    return fallback
  }

  const value = Number(raw)

  if (!Number.isFinite(value) || value < min || value > max) {
    return fallback
  }

  return value
}
