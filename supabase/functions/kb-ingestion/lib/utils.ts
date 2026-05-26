import { IngestionError, type ErrorType } from "./errors.ts"

export function requireString(value: unknown, name: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new IngestionError(`${name} is required`, "validation")
  }

  return value
}

export function classifyError(error: unknown): ErrorType {
  if (error instanceof IngestionError) {
    return error.errorType
  }

  return "system"
}

export async function fingerprintSecret(secret: string | null | undefined) {
  if (!secret) {
    return null
  }

  const data = new TextEncoder().encode(secret)
  const digest = await crypto.subtle.digest("SHA-256", data)
  const bytes = Array.from(new Uint8Array(digest))

  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 12)
}
