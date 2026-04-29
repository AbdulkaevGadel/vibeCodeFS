export {}

const maxPayloadBytes = 4096

const config = {
  chunkSize: readIntegerEnv("CHUNK_SIZE", 1000, 300, 5000),
  chunkOverlap: readIntegerEnv("CHUNK_OVERLAP", 150, 0, 1000),
  maxSweepItems: readIntegerEnv("MAX_SWEEP_ITEMS", 5, 1, 20),
  maxAttempts: readIntegerEnv("MAX_INGESTION_ATTEMPTS", 3, 1, 10),
  staleProcessingSeconds: readIntegerEnv("STALE_PROCESSING_SECONDS", 300, 30, 3600),
  retryAfterSeconds: readIntegerEnv("RETRY_AFTER_SECONDS", 60, 0, 3600),
  heartbeatIntervalMs: readIntegerEnv("HEARTBEAT_INTERVAL_MS", 15000, 1000, 120000),
  hfBatchSize: readIntegerEnv("HF_EMBEDDING_BATCH_SIZE", 8, 1, 32),
  hfRequestTimeoutMs: readIntegerEnv("HF_REQUEST_TIMEOUT_MS", 30000, 1000, 120000),
  embeddingDimension: 384,
}

type RequestPayload = {
  mode: "webhook" | "sweep"
  chunk_set_id?: string
  limit?: number
}

type ArticlePayload = {
  id: string
  title: string
  content: string
  status: string
}

type ClaimResult = {
  type: string
  chunk_set_id?: string
  article_id?: string
  content_checksum?: string
  embedding_model?: string
  embedding_dimension?: number
  processing_token?: string
  ingestion_run_id?: string
  article?: ArticlePayload
}

type ChunkPayload = {
  chunk_index: number
  chunk_text: string
  embedding: number[]
}

type ErrorType = "validation" | "external" | "system"

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST" },
    })
  }

  const expectedSecret = Deno.env.get("INTERNAL_SECRET")?.trim()
  const providedSecret = readInternalSecret(request)

  if (!expectedSecret || providedSecret !== expectedSecret) {
    console.error("kb-ingestion unauthorized request:", JSON.stringify({
      has_expected_secret: Boolean(expectedSecret),
      has_x_internal_secret: Boolean(request.headers.get("x-internal-secret")),
      has_authorization: Boolean(request.headers.get("authorization")),
      expected_secret_length: expectedSecret?.length ?? 0,
      provided_secret_length: providedSecret?.length ?? 0,
      expected_secret_fingerprint: await fingerprintSecret(expectedSecret),
      provided_secret_fingerprint: await fingerprintSecret(providedSecret),
    }))
    return jsonResponse({ ok: false, type: "unauthorized" }, 401)
  }

  let payload: RequestPayload

  try {
    payload = await readPayload(request)
  } catch (error) {
    console.error("kb-ingestion invalid payload:", getErrorMessage(error))
    return jsonResponse({ ok: false, type: "invalid_payload" }, 400)
  }

  try {
    if (payload.mode === "webhook") {
      const result = await processWebhook(payload)
      return jsonResponse(result)
    }

    const result = await processSweep(payload)
    return jsonResponse(result)
  } catch (error) {
    console.error("kb-ingestion request error:", getErrorMessage(error))
    return jsonResponse({ ok: false, type: "system_error" }, 500)
  }
})

async function readPayload(request: Request): Promise<RequestPayload> {
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

function readInternalSecret(request: Request) {
  const headerSecret = request.headers.get("x-internal-secret")?.trim()

  if (headerSecret) {
    return headerSecret
  }

  const authorization = request.headers.get("authorization")?.trim()
  const bearerPrefix = "Bearer "

  if (authorization?.startsWith(bearerPrefix)) {
    return authorization.slice(bearerPrefix.length).trim()
  }

  return null
}

async function processWebhook(payload: RequestPayload) {
  const ingestionRunId = crypto.randomUUID()
  const processingToken = crypto.randomUUID()

  const claim = await callRpc<ClaimResult>("claim_kb_chunk_set_from_webhook", {
    p_chunk_set_id: payload.chunk_set_id,
    p_processing_token: processingToken,
    p_ingestion_run_id: ingestionRunId,
  })

  if (claim.type !== "claimed") {
    console.log("kb-ingestion webhook no-op:", JSON.stringify({
      ingestion_run_id: ingestionRunId,
      chunk_set_id: payload.chunk_set_id,
      type: claim.type,
    }))

    return {
      ok: true,
      type: claim.type,
      ingestion_run_id: ingestionRunId,
      chunk_set_id: payload.chunk_set_id,
    }
  }

  return await processClaimedChunkSet(claim)
}

async function processSweep(payload: RequestPayload) {
  const limit = Math.min(payload.limit ?? config.maxSweepItems, config.maxSweepItems)
  const results: Array<Record<string, unknown>> = []

  for (let index = 0; index < limit; index += 1) {
    const ingestionRunId = crypto.randomUUID()
    const processingToken = crypto.randomUUID()

    const claim = await callRpc<ClaimResult>("claim_next_kb_chunk_set_for_ingestion", {
      p_processing_token: processingToken,
      p_ingestion_run_id: ingestionRunId,
      p_stale_after_seconds: config.staleProcessingSeconds,
      p_retry_after_seconds: config.retryAfterSeconds,
      p_max_attempts: config.maxAttempts,
    })

    if (claim.type === "empty") {
      results.push({ type: "empty" })
      break
    }

    if (claim.type !== "claimed") {
      results.push({
        type: claim.type,
        ingestion_run_id: ingestionRunId,
      })
      continue
    }

    results.push(await processClaimedChunkSet(claim))
  }

  return {
    ok: true,
    type: "sweep_finished",
    processed: results.filter((result) => result.type !== "empty").length,
    results,
  }
}

async function processClaimedChunkSet(claim: ClaimResult) {
  const chunkSetId = requireString(claim.chunk_set_id, "chunk_set_id")
  const processingToken = requireString(claim.processing_token, "processing_token")
  const ingestionRunId = requireString(claim.ingestion_run_id, "ingestion_run_id")

  try {
    if (!claim.article) {
      throw new IngestionError("Article payload is missing", "validation")
    }

    if (claim.embedding_dimension !== config.embeddingDimension) {
      throw new IngestionError("Unexpected embedding dimension", "validation")
    }

    await heartbeat(chunkSetId, processingToken)

    const sourceText = buildSourceText(claim.article.title, claim.article.content)
    const chunks = splitIntoChunks(sourceText, config.chunkSize, config.chunkOverlap)

    if (chunks.length === 0) {
      throw new IngestionError("Article content is empty after chunking", "validation")
    }

    const embeddedChunks: ChunkPayload[] = []
    let lastHeartbeatAt = Date.now()

    for (let start = 0; start < chunks.length; start += config.hfBatchSize) {
      if (Date.now() - lastHeartbeatAt >= config.heartbeatIntervalMs) {
        await heartbeat(chunkSetId, processingToken)
        lastHeartbeatAt = Date.now()
      }

      const batch = chunks.slice(start, start + config.hfBatchSize)
      const embeddings = await fetchEmbeddings(requireString(claim.embedding_model, "embedding_model"), batch)

      if (embeddings.length !== batch.length) {
        throw new IngestionError("Embedding batch size mismatch", "external")
      }

      for (let offset = 0; offset < batch.length; offset += 1) {
        const embedding = embeddings[offset]

        if (!isEmbedding(embedding, config.embeddingDimension)) {
          throw new IngestionError("Invalid embedding dimension", "external")
        }

        embeddedChunks.push({
          chunk_index: start + offset,
          chunk_text: batch[offset],
          embedding,
        })
      }

      await heartbeat(chunkSetId, processingToken)
      lastHeartbeatAt = Date.now()
    }

    const completeResult = await callRpc<Record<string, unknown>>("complete_kb_chunk_set_ingestion", {
      p_chunk_set_id: chunkSetId,
      p_processing_token: processingToken,
      p_content_checksum: requireString(claim.content_checksum, "content_checksum"),
      p_chunks: embeddedChunks,
    })

    if (completeResult.type !== "completed") {
      throw new IngestionError(`Completion failed: ${String(completeResult.type)}`, "system")
    }

    console.log("kb-ingestion completed:", JSON.stringify({
      ingestion_run_id: ingestionRunId,
      chunk_set_id: chunkSetId,
      article_id: claim.article_id,
      chunk_count: embeddedChunks.length,
    }))

    return {
      ok: true,
      type: "completed",
      ingestion_run_id: ingestionRunId,
      chunk_set_id: chunkSetId,
      chunk_count: embeddedChunks.length,
    }
  } catch (error) {
    const errorType = classifyError(error)
    const errorMessage = getErrorMessage(error)

    console.error("kb-ingestion failed:", JSON.stringify({
      ingestion_run_id: ingestionRunId,
      chunk_set_id: chunkSetId,
      article_id: claim.article_id,
      error_type: errorType,
      error_message: errorMessage,
    }))

    try {
      await callRpc("fail_kb_chunk_set_ingestion", {
        p_chunk_set_id: chunkSetId,
        p_processing_token: processingToken,
        p_error_type: errorType,
        p_error_message: errorMessage,
      })
    } catch (failError) {
      console.error("kb-ingestion failed to persist failure:", getErrorMessage(failError))
    }

    return {
      ok: false,
      type: "failed",
      ingestion_run_id: ingestionRunId,
      chunk_set_id: chunkSetId,
      error_type: errorType,
    }
  }
}

async function heartbeat(chunkSetId: string, processingToken: string) {
  const result = await callRpc<Record<string, unknown>>("heartbeat_kb_chunk_set_ingestion", {
    p_chunk_set_id: chunkSetId,
    p_processing_token: processingToken,
  })

  if (result.type !== "heartbeat") {
    throw new IngestionError(`Heartbeat failed: ${String(result.type)}`, "system")
  }
}

function buildSourceText(title: string, content: string) {
  return [title, content]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n")
}

function splitIntoChunks(text: string, chunkSize: number, overlap: number) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim()

  if (!normalized) {
    return []
  }

  const units = normalized
    .split(/\n{2,}|(?<=[.!?])\s+/g)
    .map((unit) => unit.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ""

  for (const unit of units) {
    if (unit.length > chunkSize) {
      if (current) {
        chunks.push(current)
        current = ""
      }

      for (const part of hardSplit(unit, chunkSize, overlap)) {
        chunks.push(part)
      }

      continue
    }

    const candidate = current ? `${current} ${unit}` : unit

    if (candidate.length <= chunkSize) {
      current = candidate
      continue
    }

    if (current) {
      chunks.push(current)
    }

    current = withOverlap(current, unit, overlap)
  }

  if (current) {
    chunks.push(current)
  }

  return chunks
}

function hardSplit(text: string, chunkSize: number, overlap: number) {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    const chunk = text.slice(start, end).trim()

    if (chunk) {
      chunks.push(chunk)
    }

    if (end === text.length) {
      break
    }

    start = Math.max(end - overlap, start + 1)
  }

  return chunks
}

function withOverlap(previous: string, next: string, overlap: number) {
  if (!previous || overlap <= 0) {
    return next
  }

  const suffix = previous.slice(Math.max(0, previous.length - overlap)).trim()
  const candidate = `${suffix} ${next}`.trim()

  return candidate
}

async function fetchEmbeddings(model: string, inputs: string[]) {
  const hfToken = Deno.env.get("HF_API_TOKEN")?.trim()

  if (!hfToken) {
    throw new IngestionError("HF_API_TOKEN is not configured", "validation")
  }

  const endpoint = getHfEndpoint(model)
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
        inputs,
        options: {
          wait_for_model: true,
        },
      }),
    })

    const responseText = await response.text()

    if (!response.ok) {
      throw new IngestionError(`Hugging Face request failed with status ${response.status}: ${safeProviderMessage(responseText)}`, "external")
    }

    const parsed = JSON.parse(responseText) as unknown

    return normalizeEmbeddingResponse(parsed, inputs.length)
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new IngestionError("Hugging Face request timed out", "external")
    }

    if (error instanceof IngestionError) {
      throw error
    }

    throw new IngestionError(`Hugging Face request failed: ${getErrorMessage(error)}`, "external")
  } finally {
    clearTimeout(timeoutId)
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

function normalizeEmbeddingResponse(value: unknown, inputCount: number) {
  if (!Array.isArray(value)) {
    throw new IngestionError("Hugging Face response is not an array", "external")
  }

  if (inputCount === 1 && isEmbedding(value, config.embeddingDimension)) {
    return [value]
  }

  if (value.every((item) => isEmbedding(item, config.embeddingDimension))) {
    return value as number[][]
  }

  throw new IngestionError("Hugging Face response has invalid embedding shape", "external")
}

function isEmbedding(value: unknown, dimension: number): value is number[] {
  return Array.isArray(value)
    && value.length === dimension
    && value.every((item) => typeof item === "number" && Number.isFinite(item))
}

async function callRpc<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !serviceRoleKey) {
    throw new IngestionError("Supabase env is not configured", "validation")
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
    throw new IngestionError(`RPC ${name} failed ${response.status}: ${safeProviderMessage(errorText)}`, "system")
  }

  return await response.json() as T
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

function requireString(value: unknown, name: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new IngestionError(`${name} is required`, "validation")
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
  if (error instanceof IngestionError) {
    return error.errorType
  }

  return "system"
}

function safeProviderMessage(value: string) {
  return value.replace(/hf_[A-Za-z0-9_-]+/g, "hf_***").slice(0, 500)
}

async function fingerprintSecret(secret: string | null | undefined) {
  if (!secret) {
    return null
  }

  const data = new TextEncoder().encode(secret)
  const digest = await crypto.subtle.digest("SHA-256", data)
  const bytes = Array.from(new Uint8Array(digest))

  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 12)
}

class IngestionError extends Error {
  errorType: ErrorType

  constructor(message: string, errorType: ErrorType) {
    super(message)
    this.name = "IngestionError"
    this.errorType = errorType
  }
}
