import { getErrorMessage, IngestionError } from "./errors.ts"

type EmbeddingOptions = {
  embeddingDimension: number
  requestTimeoutMs: number
}

export async function fetchEmbeddings(model: string, inputs: string[], options: EmbeddingOptions) {
  const hfToken = Deno.env.get("HF_API_TOKEN")?.trim()

  if (!hfToken) {
    throw new IngestionError("HF_API_TOKEN is not configured", "validation")
  }

  const endpoint = getHfEndpoint(model)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), options.requestTimeoutMs)

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hfToken}`,
      },
      body: JSON.stringify({
        inputs,
        options: {
          wait_for_model: true,
        },
      }),
    })

    const responseText = await response.text()

    if (!response.ok) {
      throw new IngestionError(`Hugging Face request failed with status ${response.status}: ${safeProviderMessage(responseText)}`, "external")
    }

    const parsed = JSON.parse(responseText) as unknown

    return normalizeEmbeddingResponse(parsed, inputs.length, options.embeddingDimension)
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new IngestionError("Hugging Face request timed out", "external")
    }

    if (error instanceof IngestionError) {
      throw error
    }

    throw new IngestionError(`Hugging Face request failed: ${getErrorMessage(error)}`, "external")
  } finally {
    clearTimeout(timeoutId)
  }
}

export function isEmbedding(value: unknown, dimension: number): value is number[] {
  return Array.isArray(value)
    && value.length === dimension
    && value.every((item) => typeof item === "number" && Number.isFinite(item))
}

export function safeProviderMessage(value: string) {
  return value.replace(/hf_[A-Za-z0-9_-]+/g, "hf_***").slice(0, 500)
}

function getHfEndpoint(model: string) {
  const override = Deno.env.get("HF_FEATURE_EXTRACTION_URL")?.trim()

  if (override) {
    return override
  }

  return `https://router.huggingface.co/hf-inference/models/${encodeURIComponentModel(model)}/pipeline/feature-extraction`
}

function encodeURIComponentModel(model: string) {
  return model.split("/").map((part) => encodeURIComponent(part)).join("/")
}

function normalizeEmbeddingResponse(value: unknown, inputCount: number, embeddingDimension: number) {
  if (!Array.isArray(value)) {
    throw new IngestionError("Hugging Face response is not an array", "external")
  }

  if (inputCount === 1 && isEmbedding(value, embeddingDimension)) {
    return [value]
  }

  if (value.every((item) => isEmbedding(item, embeddingDimension))) {
    return value as number[][]
  }

  throw new IngestionError("Hugging Face response has invalid embedding shape", "external")
}
