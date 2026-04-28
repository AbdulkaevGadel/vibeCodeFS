const maxPayloadBytes = 2048

type OrchestratorPayload = {
  chat_id: string
  trigger_message_id: string
  correlation_id?: string
}

type RpcResult = {
  type?: string
  run_id?: string | null
  status?: string
}

const aiConfig = {
  promptVersion: "phase-5-skeleton-v1",
  retrieval: {
    enabled: false,
  },
  context: {
    enabled: false,
  },
  behavior: {
    mode: "skeleton",
  },
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST" },
    })
  }

  const internalSecret = Deno.env.get("INTERNAL_SECRET")?.trim()
  const providedSecret = request.headers.get("x-internal-secret")?.trim()

  if (!internalSecret || providedSecret !== internalSecret) {
    console.error("ai-orchestrator unauthorized request")
    return new Response("Unauthorized", { status: 401 })
  }

  let payload: OrchestratorPayload
  let runId: string | null = null
  let processingToken: string | null = null

  try {
    payload = await readPayload(request)
  } catch (error) {
    console.error("ai-orchestrator invalid payload:", getErrorMessage(error))
    return jsonResponse({ ok: false, type: "invalid_payload" }, 400)
  }

  const correlationId = payload.correlation_id ?? crypto.randomUUID()

  try {
    const configSnapshot = {
      prompt_version: aiConfig.promptVersion,
      retrieval: aiConfig.retrieval,
      context: aiConfig.context,
      behavior: aiConfig.behavior,
    }
    const configHash = await hashJson(configSnapshot)

    const startResult = await callRpc<RpcResult>("start_chat_ai_run", {
      p_chat_id: payload.chat_id,
      p_trigger_message_id: payload.trigger_message_id,
      p_prompt_version: aiConfig.promptVersion,
      p_correlation_id: correlationId,
      p_config_snapshot: configSnapshot,
      p_config_hash: configHash,
    })

    runId = startResult.run_id ?? null

    if (startResult.type !== "started" || !runId) {
      console.log("ai-orchestrator skipped:", JSON.stringify({
        correlation_id: correlationId,
        type: startResult.type,
        run_id: runId,
      }))

      return jsonResponse({ ok: true, type: startResult.type, run_id: runId })
    }

    processingToken = crypto.randomUUID()

    const processingResult = await callRpc<RpcResult>("mark_chat_ai_run_processing", {
      p_run_id: runId,
      p_processing_token: processingToken,
    })

    if (processingResult.type !== "processing" && processingResult.type !== "already_processing") {
      return jsonResponse({
        ok: true,
        type: processingResult.type,
        run_id: runId,
      })
    }

    const finishResult = await callRpc<RpcResult>("finish_chat_ai_run", {
      p_run_id: runId,
      p_processing_token: processingToken,
      p_final_status: "completed",
      p_error_message: null,
      p_error_type: null,
    })

    return jsonResponse({
      ok: true,
      type: finishResult.type,
      status: finishResult.status,
      run_id: runId,
    })
  } catch (error) {
    console.error("ai-orchestrator error:", getErrorMessage(error))

    if (runId && processingToken) {
      try {
        await callRpc<RpcResult>("finish_chat_ai_run", {
          p_run_id: runId,
          p_processing_token: processingToken,
          p_final_status: "failed",
          p_error_message: getErrorMessage(error),
          p_error_type: "system",
        })
      } catch (finishError) {
        console.error("ai-orchestrator failed to mark run failed:", getErrorMessage(finishError))
      }
    }

    return jsonResponse({ ok: false, type: "system_error" }, 500)
  }
})

async function readPayload(request: Request): Promise<OrchestratorPayload> {
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

async function callRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase env is not configured")
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`RPC ${name} failed ${response.status}: ${errorText}`)
  }

  return await response.json() as T
}

async function hashJson(value: unknown) {
  const json = JSON.stringify(value)
  const data = new TextEncoder().encode(json)
  const digest = await crypto.subtle.digest("SHA-256", data)
  const bytes = Array.from(new Uint8Array(digest))

  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error"
}
