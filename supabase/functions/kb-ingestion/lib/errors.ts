export type ErrorType = "validation" | "external" | "system" | "pipeline_version_mismatch"

export class IngestionError extends Error {
  errorType: ErrorType

  constructor(message: string, errorType: ErrorType) {
    super(message)
    this.name = "IngestionError"
    this.errorType = errorType
  }
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error"
}
