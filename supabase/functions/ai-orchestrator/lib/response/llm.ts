import { config } from "../config.ts"
import {
  getErrorMessage,
  OrchestratorError,
  ProviderHttpError,
  ProviderTimeoutError,
} from "../errors.ts"
export { parseLlmJson } from "./llm-contract.ts"
import { callLlm } from "./llm-provider.ts"
import type { LlmResponse, PromptSnapshot } from "../types.ts"
import { delay } from "../utils.ts"

export async function callLlmWithRetry(promptSnapshot: PromptSnapshot): Promise<LlmResponse> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= config.llm.maxProviderRetries; attempt += 1) {
    try {
      return await callLlm(promptSnapshot)
    } catch (error) {
      lastError = error

      if (!isRetryableProviderError(error) || attempt >= config.llm.maxProviderRetries) {
        break
      }

      await delay(500 + attempt * 500)
    }
  }

  if (lastError instanceof OrchestratorError) {
    throw lastError
  }

  throw new OrchestratorError(`LLM request failed: ${getErrorMessage(lastError)}`, "external")
}

function isRetryableProviderError(error: unknown) {
  if (error instanceof ProviderTimeoutError) {
    return true
  }

  if (error instanceof ProviderHttpError) {
    return error.status === 429 || error.status >= 500
  }

  return false
}
