export async function hashJson(value: unknown) {
  const json = JSON.stringify(value)
  const data = new TextEncoder().encode(json)
  const digest = await crypto.subtle.digest("SHA-256", data)
  const bytes = Array.from(new Uint8Array(digest))

  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return { text: value, truncated: false }
  }

  return {
    text: value.slice(0, Math.max(0, maxChars - 20)).trimEnd() + "\n[truncated]",
    truncated: true,
  }
}

export function normalizeVisibleText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 3800)
}

export function firstRelation<T>(value: T | T[] | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
