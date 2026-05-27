import { config } from "../config.ts"
import { OrchestratorError } from "../errors.ts"

export function normalizeEmbeddingResponse(value: unknown) {
  if (!Array.isArray(value)) {
    throw new OrchestratorError("Hugging Face response is not an array", "external")
  }

  if (isEmbedding(value, config.retrieval.embeddingDimension)) {
    return [value]
  }

  if (value.every((item) => isEmbedding(item, config.retrieval.embeddingDimension))) {
    return value as number[][]
  }

  throw new OrchestratorError("Hugging Face response has invalid embedding shape", "external")
}

export function isEmbedding(value: unknown, dimension: number): value is number[] {
  return Array.isArray(value)
    && value.length === dimension
    && value.every((item) => typeof item === "number" && Number.isFinite(item))
}
