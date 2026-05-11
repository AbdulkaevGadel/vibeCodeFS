export {}

const maxPayloadBytes = 2048

const config = {
  maxItemsPerInvocation: readIntegerEnv("KB_BATCH_MAX_ITEMS", 5, 1, 20),
  staleProcessingSeconds: readIntegerEnv("KB_BATCH_STALE_PROCESSING_SECONDS", 600, 60, 3600),
  maxAttempts: readIntegerEnv("KB_BATCH_MAX_ATTEMPTS", 3, 1, 10),
  timeBudgetMs: readIntegerEnv("KB_BATCH_TIME_BUDGET_MS", 250000, 10000, 360000),
  processingPostCheckAttempts: readIntegerEnv("KB_BATCH_POST_CHECK_ATTEMPTS", 6, 1, 20),
  processingPostCheckDelayMs: readIntegerEnv("KB_BATCH_POST_CHECK_DELAY_MS", 2000, 250, 10000),
}

type RequestPayload = {
  batch_id?: string
}

type ClaimResult = {
  type: string
  item_id?: string
  batch_id?: string
  article_id?: string
  article_title?: string
  article_version?: number
  attempt_count?: number
  processing_token?: string
}

type RefreshResult = {
  type: string
  chunk_set_id?: string | null
  result_type?: string | null
}

type IngestionResult = {
  ok?: boolean
  type?: string
  error_type?: string
}

type ChunkSetStatusResult = {
  type: string
  status?: string
  is_active?: boolean
  last_error_type?: string | null
  error_message?: string | null
}

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
    console.error("kb-embedding-refresh-batch unauthorized request:", JSON.stringify({
      has_expected_secret: Boolean(expectedSecret),
      has_x_internal_secret: Boolean(request.headers.get("x-internal-secret")),
      has_authorization: Boolean(request.headers.get("authorization")),
    }))

    return jsonResponse({ ok: false, type: "unauthorized" }, 401)
  }

  let payload: RequestPayload

  try {
    payload = await readPayload(request)
  } catch (error) {
    console.error("kb-embedding-refresh-batch invalid payload:", getErrorMessage(error))
    return jsonResponse({ ok: false, type: "invalid_payload" }, 400)
  }

  EdgeRuntime.waitUntil(runWorker(payload))

  return jsonResponse({
    ok: true,
    type: "accepted",
    batch_id: payload.batch_id ?? null,
  }, 202)
})

async function runWorker(payload: RequestPayload) {
  const startedAt = Date.now()
  let processed = 0
  let shouldResume = false

  try {
    for (let index = 0; index < config.maxItemsPerInvocation; index += 1) {
      if (Date.now() - startedAt >= config.timeBudgetMs) {
        shouldResume = true
        break
      }

      const processingToken = crypto.randomUUID()
      const claim = await callRpc<ClaimResult>("claim_next_kb_embedding_refresh_batch_item_v1", {
        p_processing_token: processingToken,
        p_stale_after_seconds: config.staleProcessingSeconds,
        p_max_attempts: config.maxAttempts,
      })

      if (claim.type === "empty") {
        shouldResume = false
        break
      }

      if (claim.type !== "claimed") {
        console.log("kb-embedding-refresh-batch claim no-op:", JSON.stringify({
          type: claim.type,
        }))
        continue
      }

      if (payload.batch_id && claim.batch_id !== payload.batch_id) {
        await finishItem(claim, "skipped", "BATCH_MISMATCH", null, "Claimed item belongs to another batch.")
        continue
      }

      await processClaimedItem(claim)
      processed += 1
      shouldResume = true
    }

    console.log("kb-embedding-refresh-batch worker finished:", JSON.stringify({
      batch_id: payload.batch_id ?? null,
      processed,
      should_resume: shouldResume,
    }))
  } catch (error) {
    console.error("kb-embedding-refresh-batch worker failed:", getErrorMessage(error))
    shouldResume = true
  }

  if (shouldResume) {
    await invokeSelf(payload.batch_id ?? null)
  }
}

async function processClaimedItem(claim: ClaimResult) {
  const itemId = requireString(claim.item_id, "item_id")
  const processingToken = requireString(claim.processing_token, "processing_token")

  try {
    const refresh = await callRpc<RefreshResult>("request_kb_embedding_refresh_for_batch_item_v1", {
      p_item_id: itemId,
      p_processing_token: processingToken,
    })

    if (refresh.type === "queued" || refresh.type === "retry_queued") {
      const chunkSetId = requireString(refresh.chunk_set_id, "chunk_set_id")
      const ingestion = await invokeKbIngestion(chunkSetId)

      if (ingestion.ok === true && ingestion.type === "completed") {
        await finishItem(claim, "completed", refresh.type, chunkSetId, null)
        return
      }

      if (ingestion.type === "not_claimed") {
        const chunkSetStatus = await waitForChunkSetTerminalStatus(chunkSetId)

        if (chunkSetStatus.type === "ok" && chunkSetStatus.status === "completed" && chunkSetStatus.is_active === true) {
          await finishItem(claim, "completed", "INGESTION_ALREADY_COMPLETED", chunkSetId, null)
          return
        }

        if (chunkSetStatus.type === "ok" && chunkSetStatus.status === "processing") {
          await finishItem(claim, "skipped", "INGESTION_ALREADY_PROCESSING", chunkSetId, null)
          return
        }
      }

      await finishItem(
        claim,
        "failed",
        `INGESTION_${String(ingestion.type ?? "FAILED").toUpperCase()}`,
        chunkSetId,
        `kb-ingestion failed with type ${String(ingestion.type ?? "unknown")}`,
      )
      return
    }

    if (refresh.type === "already_actual") {
      await finishItem(claim, "skipped", "ALREADY_ACTUAL", refresh.chunk_set_id ?? null, null)
      return
    }

    if (refresh.type === "already_updating") {
      await finishItem(claim, "skipped", "ALREADY_UPDATING", refresh.chunk_set_id ?? null, null)
      return
    }

    if (refresh.type === "skipped") {
      await finishItem(claim, "skipped", refresh.result_type ?? "SKIPPED", refresh.chunk_set_id ?? null, null)
      return
    }

    if (refresh.type === "unavailable") {
      await finishItem(
        claim,
        "failed",
        refresh.result_type ?? "EMBEDDINGS_UNAVAILABLE",
        refresh.chunk_set_id ?? null,
        refresh.result_type ?? "Embeddings are unavailable for this article.",
      )
      return
    }

    await finishItem(
      claim,
      "failed",
      `UNEXPECTED_REFRESH_RESULT_${refresh.type.toUpperCase()}`,
      refresh.chunk_set_id ?? null,
      `Unexpected refresh result: ${refresh.type}`,
    )
  } catch (error) {
    console.error("kb-embedding-refresh-batch item failed:", JSON.stringify({
      item_id: itemId,
      batch_id: claim.batch_id,
      article_id: claim.article_id,
      error_message: getErrorMessage(error),
    }))

    await finishItem(claim, "failed", "WORKER_ERROR", null, getErrorMessage(error))
  }
}

async function waitForChunkSetTerminalStatus(chunkSetId: string) {
  let lastStatus: ChunkSetStatusResult = { type: "not_checked" }

  for (let attempt = 0; attempt < config.processingPostCheckAttempts; attempt += 1) {
    lastStatus = await readChunkSetStatus(chunkSetId)

    if (lastStatus.type !== "ok") {
      return lastStatus
    }

    if (lastStatus.status !== "processing" && lastStatus.status !== "pending") {
      return lastStatus
    }

    await delay(config.processingPostCheckDelayMs)
  }

  return lastStatus
}

async function readChunkSetStatus(chunkSetId: string) {
  return await callRpc<ChunkSetStatusResult>("get_kb_chunk_set_status_v1", {
    p_chunk_set_id: chunkSetId,
  })
}

async function finishItem(
  claim: ClaimResult,
  status: "completed" | "failed" | "skipped",
  resultType: string,
  chunkSetId: string | null,
  errorMessage: string | null,
) {
  await callRpc("finish_kb_embedding_refresh_batch_item_v1", {
    p_item_id: claim.item_id,
    p_processing_token: claim.processing_token,
    p_status: status,
    p_result_type: resultType,
    p_chunk_set_id: chunkSetId,
    p_error_message: errorMessage,
  })
}

async function invokeKbIngestion(chunkSetId: string): Promise<IngestionResult> {
  const supabaseUrl = readSupabaseUrl()
  const internalSecret = readInternalSecretEnv()

  const response = await fetch(`${supabaseUrl}/functions/v1/kb-ingestion`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": internalSecret,
    },
    body: JSON.stringify({
      mode: "webhook",
      chunk_set_id: chunkSetId,
    }),
  })

  const responseText = await response.text()
  const body = parseJsonObject(responseText)

  if (!response.ok) {
    return {
      ok: false,
      type: `http_${response.status}`,
    }
  }

  return body as IngestionResult
}

async function invokeSelf(batchId: string | null) {
  const supabaseUrl = readSupabaseUrl()
  const internalSecret = readInternalSecretEnv()

  const response = await fetch(`${supabaseUrl}/functions/v1/kb-embedding-refresh-batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": internalSecret,
    },
    body: JSON.stringify({
      batch_id: batchId,
    }),
  })

  if (!response.ok) {
    console.error("kb-embedding-refresh-batch self-resume failed:", JSON.stringify({
      status: response.status,
      body: await response.text(),
    }))
  }
}

async function callRpc<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const supabaseUrl = readSupabaseUrl()
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim()

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured")
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
    throw new Error(`RPC ${name} failed ${response.status}: ${safeLogMessage(errorText)}`)
  }

  return await response.json() as T
}

async function readPayload(request: Request): Promise<RequestPayload> {
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

function readInternalSecretEnv() {
  const internalSecret = Deno.env.get("INTERNAL_SECRET")?.trim()

  if (!internalSecret) {
    throw new Error("INTERNAL_SECRET is not configured")
  }

  return internalSecret
}

function readSupabaseUrl() {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL"))?.trim()

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is not configured")
  }

  return supabaseUrl.replace(/\/$/, "")
}

function parseJsonObject(value: string) {
  if (!value) {
    return {}
  }

  try {
    const parsed = JSON.parse(value)

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
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
    throw new Error(`${name} is required`)
  }

  return value
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
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

function safeLogMessage(value: string) {
  return value.replace(/hf_[A-Za-z0-9_-]+/g, "hf_***").slice(0, 500)
}
