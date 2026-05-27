const maxPayloadBytes = 2048

export type OrchestratorPayload = {
  chat_id: string
  trigger_message_id: string
  correlation_id?: string
}

export async function readPayload(request: Request): Promise<OrchestratorPayload> {
  const bodyText = await request.text()

  if (bodyText.length > maxPayloadBytes) {
    throw new Error("Payload is too large")
  }

  const raw = JSON.parse(bodyText) as Record<string, unknown>
  const allowedKeys = new Set(["chat_id", "trigger_message_id", "correlation_id"])

  for (const key of Object.keys(raw)) {
    if (!allowedKeys.has(key)) {
      throw new Error("Payload contains unexpected fields")
    }
  }

  if (typeof raw.chat_id !== "string" || raw.chat_id.length === 0) {
    throw new Error("chat_id is required")
  }

  if (typeof raw.trigger_message_id !== "string" || raw.trigger_message_id.length === 0) {
    throw new Error("trigger_message_id is required")
  }

  if (raw.correlation_id !== undefined && typeof raw.correlation_id !== "string") {
    throw new Error("correlation_id must be a string")
  }

  return {
    chat_id: raw.chat_id,
    trigger_message_id: raw.trigger_message_id,
    correlation_id: raw.correlation_id,
  }
}
