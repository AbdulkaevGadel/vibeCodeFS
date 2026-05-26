import { config } from "../config.ts"
import { isEmbedding, normalizeEmbeddingResponse } from "./embedding-contract.ts"
import {
  EmbeddingProviderHttpError,
  EmbeddingProviderTimeoutError,
  getErrorMessage,
  OrchestratorError,
  RetrievalStageTimeoutError,
  safeProviderMessage,
} from "../errors.ts"
import { delay } from "../utils.ts"

export async function fetchEmbedding(input: string, signal?: AbortSignal): Promise<number[]> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= config.retrieval.embeddingMaxProviderRetries; attempt += 1) {
    try {
      return await fetchEmbeddingOnce(input, signal)
    } catch (error) {
      lastError = error

      if (!isRetryableEmbeddingProviderError(error) || attempt >= config.retrieval.embeddingMaxProviderRetries) {
        break
      }

      if (signal?.aborted) {
        throw new RetrievalStageTimeoutError()
      }

      await delay(500 + attempt * 500)
    }
  }

  if (lastError instanceof OrchestratorError) {
    throw lastError
  }

  throw new OrchestratorError(`Hugging Face request failed: ${getErrorMessage(lastError)}`, "external")
}

async function fetchEmbeddingOnce(input: string, signal?: AbortSignal) {
  const hfToken = Deno.env.get("HF_API_TOKEN")?.trim()

  if (!hfToken) {
    throw new OrchestratorError("HF_API_TOKEN is not configured", "validation")
  }

  const endpoint = getHfEndpoint(config.retrieval.embeddingModel)
  const controller = new AbortController()
  const abortFromParent = () => controller.abort()
  const timeoutId = setTimeout(() => controller.abort(), config.hfRequestTimeoutMs)

  if (signal?.aborted) {
    throw new RetrievalStageTimeoutError()
  }

  signal?.addEventListener("abort", abortFromParent, { once: true })

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hfToken}`,
      },
      body: JSON.stringify({
        inputs: [input],
        options: {
          wait_for_model: true,
        },
      }),
    })

    const responseText = await response.text()

    if (!response.ok) {
      throw new EmbeddingProviderHttpError(response.status, safeProviderMessage(responseText))
    }

    const parsed = JSON.parse(responseText) as unknown
    const embeddings = normalizeEmbeddingResponse(parsed)
    const embedding = embeddings[0]

    if (!isEmbedding(embedding, config.retrieval.embeddingDimension)) {
      throw new OrchestratorError("Invalid query embedding dimension", "external")
    }

    return embedding
  } catch (error) {
    if (signal?.aborted) {
      throw new RetrievalStageTimeoutError()
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new EmbeddingProviderTimeoutError()
    }

    if (error instanceof OrchestratorError) {
      throw error
    }

    throw new OrchestratorError(`Hugging Face request failed: ${getErrorMessage(error)}`, "external")
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener("abort", abortFromParent)
  }
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

function isRetryableEmbeddingProviderError(error: unknown) {
  if (error instanceof EmbeddingProviderTimeoutError) {
    return true
  }

  if (error instanceof EmbeddingProviderHttpError) {
    return error.status === 429 || error.status >= 500
  }

  return false
}
