export type ErrorType = "validation" | "external" | "system"

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error"
}

export function getFailureErrorMessage(error: unknown) {
  if (error instanceof RetrievalStageTimeoutError) {
    return "RETRIEVAL_STAGE_TIMEOUT"
  }

  return getErrorMessage(error)
}

export function getStageErrorMessage(error: unknown) {
  return safeProviderMessage(getFailureErrorMessage(error)).slice(0, 500)
}

export function classifyError(error: unknown): ErrorType {
  if (error instanceof OrchestratorError) {
    return error.errorType
  }

  return "system"
}

export function isTemporaryExternalFailure(error: unknown) {
  if (error instanceof RetrievalStageTimeoutError) {
    return true
  }

  if (error instanceof ProviderTimeoutError || error instanceof EmbeddingProviderTimeoutError) {
    return true
  }

  if (error instanceof ProviderHttpError || error instanceof EmbeddingProviderHttpError) {
    return error.status === 429 || error.status >= 500
  }

  if (error instanceof OrchestratorError && error.errorType === "external") {
    return error.message.startsWith("LLM request failed:")
      || error.message.startsWith("Hugging Face request failed:")
  }

  return false
}

export function safeProviderMessage(value: string) {
  return value.replace(/hf_[A-Za-z0-9_-]+/g, "hf_***").slice(0, 500)
}

export class OrchestratorError extends Error {
  errorType: ErrorType

  constructor(message: string, errorType: ErrorType) {
    super(message)
    this.name = "OrchestratorError"
    this.errorType = errorType
  }
}

export class ProviderHttpError extends OrchestratorError {
  status: number

  constructor(status: number, providerMessage: string) {
    super(`LLM provider request failed with status ${status}: ${providerMessage}`, "external")
    this.name = "ProviderHttpError"
    this.status = status
  }
}

export class ProviderTimeoutError extends OrchestratorError {
  constructor(message: string) {
    super(message, "external")
    this.name = "ProviderTimeoutError"
  }
}

export class EmbeddingProviderHttpError extends OrchestratorError {
  status: number

  constructor(status: number, providerMessage: string) {
    super(`Hugging Face request failed with status ${status}: ${providerMessage}`, "external")
    this.name = "EmbeddingProviderHttpError"
    this.status = status
  }
}

export class EmbeddingProviderTimeoutError extends OrchestratorError {
  constructor() {
    super("Hugging Face request timed out", "external")
    this.name = "EmbeddingProviderTimeoutError"
  }
}

export class RetrievalStageTimeoutError extends OrchestratorError {
  constructor() {
    super("RETRIEVAL_STAGE_TIMEOUT", "external")
    this.name = "RetrievalStageTimeoutError"
  }
}
