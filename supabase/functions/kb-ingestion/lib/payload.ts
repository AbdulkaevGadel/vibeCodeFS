export type RequestPayload = {
  mode: "webhook" | "sweep"
  chunk_set_id?: string
  limit?: number
}

const maxPayloadBytes = 4096

export async function readPayload(request: Request): Promise<RequestPayload> {
  const bodyText = await request.text()

  if (bodyText.length > maxPayloadBytes) {
    throw new Error("Payload is too large")
  }

  const raw = JSON.parse(bodyText) as Record<string, unknown>
  const allowedKeys = new Set([
    "mode",
    "chunk_set_id",
    "limit",
    "type",
    "table",
    "record",
    "old_record",
    "schema",
  ])

  for (const key of Object.keys(raw)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unexpected field: ${key}`)
    }
  }

  const webhookChunkSetId = readWebhookChunkSetId(raw)
  const mode = raw.mode === undefined ? (webhookChunkSetId ? "webhook" : "sweep") : raw.mode

  if (mode !== "webhook" && mode !== "sweep") {
    throw new Error("mode must be webhook or sweep")
  }

  if (mode === "webhook") {
    const chunkSetId = raw.chunk_set_id ?? webhookChunkSetId

    if (typeof chunkSetId !== "string" || chunkSetId.length === 0) {
      throw new Error("chunk_set_id is required for webhook mode")
    }

    return {
      mode,
      chunk_set_id: chunkSetId,
    }
  }

  const rawLimit = raw.limit

  if (rawLimit !== undefined && (!Number.isInteger(rawLimit) || Number(rawLimit) <= 0)) {
    throw new Error("limit must be a positive integer")
  }

  return {
    mode,
    limit: rawLimit === undefined ? undefined : Number(rawLimit),
  }
}

function readWebhookChunkSetId(raw: Record<string, unknown>) {
  const record = raw.record

  if (!record || typeof record !== "object") {
    return null
  }

  const id = (record as Record<string, unknown>).id

  return typeof id === "string" ? id : null
}
