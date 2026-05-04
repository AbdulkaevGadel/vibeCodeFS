const maxPayloadBytes = 2048

const config = {
  promptVersion: "phase-8-retrieval-v1",
  retrieval: {
    enabled: true,
    matchThreshold: readNumberEnv("RETRIEVAL_MATCH_THRESHOLD", 0.60, 0, 1),
    matchCount: readIntegerEnv("RETRIEVAL_MATCH_COUNT", 5, 1, 20),
    candidateCount: readIntegerEnv("RETRIEVAL_CANDIDATE_COUNT", 50, 5, 200),
    embeddingProvider: "huggingface",
    embeddingModel: "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    embeddingDimension: 384,
  },
  context: {
    enabled: false,
  },
  behavior: {
    mode: "retrieval_only",
  },
  hfRequestTimeoutMs: readIntegerEnv("HF_REQUEST_TIMEOUT_MS", 30000, 1000, 120000),
}

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

type TriggerMessage = {
  id: string
  chat_id: string
  text: string
  sender_type: string
}

type RetrievalStatus = "hit" | "miss" | "empty" | "failed"

type RetrievalResult = {
  retrieval_status: RetrievalStatus
  top_similarity_score: number | null
  matched_chunks_count: number
  chunks: RetrievalChunk[]
  error_type?: ErrorType
  error_message?: string
}

type RetrievalChunk = {
  chunk_id: string
  article_id: string
  chunk_index: number
  similarity_score: number
}

type ErrorType = "validation" | "external" | "system"

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
    validateRetrievalConfig()

    const configSnapshot = {
      prompt_version: config.promptVersion,
      retrieval: config.retrieval,
      context: config.context,
      behavior: config.behavior,
    }
    const configHash = await hashJson(configSnapshot)

    const startResult = await callRpc<RpcResult>("start_chat_ai_run", {
      p_chat_id: payload.chat_id,
      p_trigger_message_id: payload.trigger_message_id,
      p_prompt_version: config.promptVersion,
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

    const retrievalResult = await runRetrieval(payload.trigger_message_id)
    const saveResult = await saveRetrievalResult(runId, processingToken, retrievalResult)

    if (saveResult.type !== "saved" && saveResult.type !== "already_saved") {
      return jsonResponse({
        ok: true,
        type: saveResult.type,
        run_id: runId,
      })
    }

    const finalStatus = retrievalResult.retrieval_status === "failed" ? "failed" : "completed"
    const finishResult = await callRpc<RpcResult>("finish_chat_ai_run", {
      p_run_id: runId,
      p_processing_token: processingToken,
      p_final_status: finalStatus,
      p_error_message: retrievalResult.retrieval_status === "failed"
        ? retrievalResult.error_message ?? "RETRIEVAL_FAILED"
        : null,
      p_error_type: retrievalResult.retrieval_status === "failed"
        ? retrievalResult.error_type ?? "system"
        : null,
    })

    return jsonResponse({
      ok: true,
      type: finishResult.type,
      status: finishResult.status,
      run_id: runId,
      retrieval_status: retrievalResult.retrieval_status,
      matched_chunks_count: retrievalResult.matched_chunks_count,
      top_similarity_score: retrievalResult.top_similarity_score,
    })
  } catch (error) {
    console.error("ai-orchestrator error:", getErrorMessage(error))

    if (runId && processingToken) {
      try {
        await saveRetrievalResult(runId, processingToken, {
          retrieval_status: "failed",
          top_similarity_score: null,
          matched_chunks_count: 0,
          chunks: [],
          error_type: classifyError(error),
          error_message: getErrorMessage(error),
        })
      } catch (saveError) {
        console.error("ai-orchestrator failed to save retrieval failure:", getErrorMessage(saveError))
      }

      try {
        await callRpc<RpcResult>("finish_chat_ai_run", {
          p_run_id: runId,
          p_processing_token: processingToken,
          p_final_status: "failed",
          p_error_message: getErrorMessage(error),
          p_error_type: classifyError(error),
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
    throw new OrchestratorError("Payload is too large", "validation")
  }

  const raw = JSON.parse(bodyText) as Record<string, unknown>
  const allowedKeys = new Set(["chat_id", "trigger_message_id", "correlation_id"])

  for (const key of Object.keys(raw)) {
    if (!allowedKeys.has(key)) {
      throw new OrchestratorError("Payload contains unexpected fields", "validation")
    }
  }

  if (typeof raw.chat_id !== "string" || raw.chat_id.length === 0) {
    throw new OrchestratorError("chat_id is required", "validation")
  }

  if (typeof raw.trigger_message_id !== "string" || raw.trigger_message_id.length === 0) {
    throw new OrchestratorError("trigger_message_id is required", "validation")
  }

  if (raw.correlation_id !== undefined && typeof raw.correlation_id !== "string") {
    throw new OrchestratorError("correlation_id must be a string", "validation")
  }

  return {
    chat_id: raw.chat_id,
    trigger_message_id: raw.trigger_message_id,
    correlation_id: raw.correlation_id,
  }
}

async function runRetrieval(triggerMessageId: string): Promise<RetrievalResult> {
  const triggerMessage = await fetchTriggerMessage(triggerMessageId)
  const queryEmbedding = await fetchEmbedding(triggerMessage.text)

  const result = await callRpc<RetrievalResult>("match_knowledge_chunks_v1", {
    p_query_embedding: queryEmbedding,
    p_query_text: triggerMessage.text,
    p_match_threshold: config.retrieval.matchThreshold,
    p_match_count: config.retrieval.matchCount,
    p_candidate_count: config.retrieval.candidateCount,
  })

  return normalizeRetrievalResult(result)
}

async function fetchTriggerMessage(triggerMessageId: string): Promise<TriggerMessage> {
  const rows = await callRest<TriggerMessage[]>(
    `/rest/v1/chat_messages?id=eq.${encodeURIComponent(triggerMessageId)}&select=id,chat_id,text,sender_type&limit=1`,
  )
  const message = rows[0]

  if (!message) {
    throw new OrchestratorError("Trigger message was not found", "validation")
  }

  if (message.sender_type !== "client") {
    throw new OrchestratorError("Trigger message is not a client message", "validation")
  }

  if (!message.text.trim()) {
    throw new OrchestratorError("Trigger message text is empty", "validation")
  }

  return message
}

async function saveRetrievalResult(runId: string, processingToken: string, result: RetrievalResult) {
  return await callRpc<RpcResult>("save_chat_ai_retrieval_result", {
    p_run_id: runId,
    p_processing_token: processingToken,
    p_retrieval_status: result.retrieval_status,
    p_top_similarity_score: result.top_similarity_score,
    p_matched_chunks_count: result.matched_chunks_count,
    p_retrieval_chunks: result.chunks,
    p_error_message: result.error_message ?? null,
    p_error_type: result.error_type ?? null,
  })
}

async function fetchEmbedding(input: string) {
  const hfToken = Deno.env.get("HF_API_TOKEN")?.trim()

  if (!hfToken) {
    throw new OrchestratorError("HF_API_TOKEN is not configured", "validation")
  }

  const endpoint = getHfEndpoint(config.retrieval.embeddingModel)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), config.hfRequestTimeoutMs)

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
      throw new OrchestratorError(
        `Hugging Face request failed with status ${response.status}: ${safeProviderMessage(responseText)}`,
        "external",
      )
    }

    const parsed = JSON.parse(responseText) as unknown
    const embeddings = normalizeEmbeddingResponse(parsed)
    const embedding = embeddings[0]

    if (!isEmbedding(embedding, config.retrieval.embeddingDimension)) {
      throw new OrchestratorError("Invalid query embedding dimension", "external")
    }

    return embedding
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new OrchestratorError("Hugging Face request timed out", "external")
    }

    if (error instanceof OrchestratorError) {
      throw error
    }

    throw new OrchestratorError(`Hugging Face request failed: ${getErrorMessage(error)}`, "external")
  } finally {
    clearTimeout(timeoutId)
  }
}

function normalizeEmbeddingResponse(value: unknown) {
  if (!Array.isArray(value)) {
    throw new OrchestratorError("Hugging Face response is not an array", "external")
  }

  if (isEmbedding(value, config.retrieval.embeddingDimension)) {
    return [value]
  }

  if (value.every((item) => isEmbedding(item, config.retrieval.embeddingDimension))) {
    return value as number[][]
  }

  throw new OrchestratorError("Hugging Face response has invalid embedding shape", "external")
}

function normalizeRetrievalResult(value: RetrievalResult): RetrievalResult {
  if (!["hit", "miss", "empty", "failed"].includes(value.retrieval_status)) {
    throw new OrchestratorError("Retrieval RPC returned invalid status", "system")
  }

  if (!Array.isArray(value.chunks)) {
    throw new OrchestratorError("Retrieval RPC returned invalid chunks", "system")
  }

  return {
    retrieval_status: value.retrieval_status,
    top_similarity_score: typeof value.top_similarity_score === "number" ? value.top_similarity_score : null,
    matched_chunks_count: Number.isInteger(value.matched_chunks_count) ? value.matched_chunks_count : 0,
    chunks: value.chunks,
    error_type: value.error_type,
    error_message: value.error_message,
  }
}

async function callRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  return await callRest<T>(`/rest/v1/rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(body),
  })
}

async function callRest<T>(path: string, init?: RequestInit): Promise<T> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !serviceRoleKey) {
    throw new OrchestratorError("Supabase env is not configured", "validation")
  }

  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new OrchestratorError(`Supabase request failed ${response.status}: ${safeProviderMessage(errorText)}`, "system")
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

function validateRetrievalConfig() {
  if (config.retrieval.candidateCount < config.retrieval.matchCount * 5) {
    throw new OrchestratorError("RETRIEVAL_CANDIDATE_COUNT must be at least match_count * 5", "validation")
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

function isEmbedding(value: unknown, dimension: number): value is number[] {
  return Array.isArray(value)
    && value.length === dimension
    && value.every((item) => typeof item === "number" && Number.isFinite(item))
}

function readIntegerEnv(name: string, fallback: number, min: number, max: number) {
  const raw = Deno.env.get(name)

  if (!raw) {
    return fallback
  }

  const value = Number(raw)

  if (!Number.isInteger(value) || value < min || value > max) {
    return fallback
  }

  return value
}

function readNumberEnv(name: string, fallback: number, min: number, max: number) {
  const raw = Deno.env.get(name)

  if (!raw) {
    return fallback
  }

  const value = Number(raw)

  if (!Number.isFinite(value) || value < min || value > max) {
    return fallback
  }

  return value
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

function classifyError(error: unknown): ErrorType {
  if (error instanceof OrchestratorError) {
    return error.errorType
  }

  return "system"
}

function safeProviderMessage(value: string) {
  return value.replace(/hf_[A-Za-z0-9_-]+/g, "hf_***").slice(0, 500)
}

class OrchestratorError extends Error {
  errorType: ErrorType

  constructor(message: string, errorType: ErrorType) {
    super(message)
    this.name = "OrchestratorError"
    this.errorType = errorType
  }
}
