export type RequestPayload = {
  batch_id?: string
}

const maxPayloadBytes = 2048

export async function readPayload(request: Request): Promise<RequestPayload> {
  const bodyText = await request.text()

  if (bodyText.length > maxPayloadBytes) {
    throw new Error("Payload is too large")
  }

  if (!bodyText.trim()) {
    return {}
  }

  const raw = JSON.parse(bodyText) as Record<string, unknown>
  const allowedKeys = new Set(["batch_id"])

  for (const key of Object.keys(raw)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unexpected field: ${key}`)
    }
  }

  if (raw.batch_id !== undefined && typeof raw.batch_id !== "string") {
    throw new Error("batch_id must be a string")
  }

  return {
    batch_id: typeof raw.batch_id === "string" ? raw.batch_id : undefined,
  }
}
