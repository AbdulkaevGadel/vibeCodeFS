export {}

const maxPayloadBytes = 4096
const workerPipelineVersion = "kb_ingestion_v4"

const config = {
  chunkSize: readIntegerEnv("CHUNK_SIZE", 700, 300, 900),
  chunkOverlap: readIntegerEnv("CHUNK_OVERLAP", 120, 0, 400),
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
  ingestion_pipeline_version?: string
  expected_ingestion_pipeline_version?: string
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

type ErrorType = "validation" | "external" | "system" | "pipeline_version_mismatch"

type ArticleUnit = {
  sectionLabel: string | null
  stepLabel: string | null
  text: string
  userPhrases: string[]
}

type TextBlock = {
  sectionLabel: string | null
  stepLabel: string | null
  lines: string[]
  userPhrases: string[]
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
    const expectedPipelineVersion = await getExpectedPipelineVersion()

    if (workerPipelineVersion !== expectedPipelineVersion) {
      console.error("kb-ingestion pipeline version mismatch:", JSON.stringify({
        worker_pipeline_version: workerPipelineVersion,
        expected_pipeline_version: expectedPipelineVersion,
      }))

      return jsonResponse({
        ok: false,
        type: "pipeline_version_mismatch",
        worker_pipeline_version: workerPipelineVersion,
        expected_pipeline_version: expectedPipelineVersion,
      })
    }

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
  const chunkSetPipelineVersion = requireString(claim.ingestion_pipeline_version, "ingestion_pipeline_version")

  try {
    if (!claim.article) {
      throw new IngestionError("Article payload is missing", "validation")
    }

    if (chunkSetPipelineVersion !== workerPipelineVersion) {
      throw new IngestionError("PIPELINE_VERSION_MISMATCH", "pipeline_version_mismatch")
    }

    if (claim.embedding_dimension !== config.embeddingDimension) {
      throw new IngestionError("Unexpected embedding dimension", "validation")
    }

    await heartbeat(chunkSetId, processingToken)

    const chunks = buildRetrievalChunks(claim.article.title, claim.article.content, config.chunkSize, config.chunkOverlap)

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
      p_ingestion_pipeline_version: workerPipelineVersion,
      p_chunks: embeddedChunks,
    })

    if (completeResult.type === "pipeline_version_mismatch") {
      throw new IngestionError("PIPELINE_VERSION_MISMATCH", "pipeline_version_mismatch")
    }

    if (completeResult.type !== "completed") {
      throw new IngestionError(`Completion failed: ${String(completeResult.type)}`, "system")
    }

    console.log("kb-ingestion completed:", JSON.stringify({
      ingestion_run_id: ingestionRunId,
      chunk_set_id: chunkSetId,
      article_id: claim.article_id,
      chunk_count: embeddedChunks.length,
      ingestion_pipeline_version: workerPipelineVersion,
    }))

    return {
      ok: true,
      type: "completed",
      ingestion_run_id: ingestionRunId,
      chunk_set_id: chunkSetId,
      chunk_count: embeddedChunks.length,
      ingestion_pipeline_version: workerPipelineVersion,
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

async function getExpectedPipelineVersion() {
  const version = await callRpc<string>("get_kb_ingestion_pipeline_version_v1", {})

  return requireString(version, "expected_pipeline_version")
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

function buildRetrievalChunks(title: string, content: string, chunkSize: number, overlap: number) {
  const articleTitle = normalizeInlineText(title)
  const units = extractArticleUnits(articleTitle, content)

  if (units.length === 0) {
    return articleTitle ? [`Article: ${articleTitle}`] : []
  }

  const chunks: string[] = []
  const targetSize = Math.min(chunkSize, 700)
  const hardMaxSize = Math.min(Math.max(chunkSize, 300), 900)

  for (const unit of mergeShortUnits(units, articleTitle, targetSize)) {
    const chunkText = formatRetrievalChunk(articleTitle, unit)

    if (chunkText.length <= hardMaxSize) {
      chunks.push(chunkText)
      continue
    }

    for (const part of splitLongRetrievalChunk(articleTitle, unit, hardMaxSize, overlap)) {
      chunks.push(part)
    }
  }

  return chunks.filter((chunk) => chunk.trim().length > 0)
}

function extractArticleUnits(articleTitle: string, content: string) {
  const units: ArticleUnit[] = []
  let currentSection: string | null = null
  let current: TextBlock | null = null

  const flushCurrent = () => {
    if (!current) {
      return
    }

    const text = normalizeUnitText(current.lines.join("\n"))

    if (text) {
      units.push({
        sectionLabel: current.sectionLabel,
        stepLabel: current.stepLabel,
        text,
        userPhrases: uniqueStrings(current.userPhrases),
      })
    }

    current = null
  }

  const beginBlock = (stepLabel: string | null, initialLine: string | null = null, sectionLabel = currentSection) => {
    flushCurrent()
    const nextBlock = {
      sectionLabel,
      stepLabel,
      lines: initialLine ? [initialLine] : [],
      userPhrases: [],
    }

    current = nextBlock

    return nextBlock
  }

  for (const rawLine of normalizeNewlines(content).split("\n")) {
    const trimmed = rawLine.trim()

    if (!trimmed || isHorizontalRule(trimmed)) {
      flushCurrent()
      continue
    }

    if (articleTitle && canonicalTitle(trimmed) === canonicalTitle(articleTitle)) {
      continue
    }

    const headingLabel = readSupportedHeading(trimmed)

    if (headingLabel) {
      flushCurrent()
      currentSection = headingLabel
      continue
    }

    const supportLabel = readSupportSectionLabel(trimmed)

    if (supportLabel) {
      flushCurrent()
      currentSection = supportLabel
      continue
    }

    const numberedStep = readNumberedStep(trimmed)

    if (numberedStep) {
      const stepLine = numberedStep.text
        ? `${numberedStep.label}: ${numberedStep.text}`
        : numberedStep.label

      beginBlock(numberedStep.label, stepLine, null)
      continue
    }

    const cleanLine = cleanMarkdownLine(rawLine)

    if (!cleanLine) {
      continue
    }

    if (!current) {
      current = beginBlock(null)
    }

    const activeBlock = current

    if (!activeBlock) {
      continue
    }

    activeBlock.lines.push(cleanLine)

    for (const phrase of readUserPhrasesFromLine(cleanLine, currentSection)) {
      activeBlock.userPhrases.push(phrase)
    }
  }

  flushCurrent()

  return units
}

function mergeShortUnits(units: ArticleUnit[], articleTitle: string, targetSize: number) {
  const merged: ArticleUnit[] = []

  for (const unit of units) {
    const previous = merged[merged.length - 1]

    if (
      previous
      && !unit.stepLabel
      && !previous.stepLabel
      && previous.sectionLabel === unit.sectionLabel
      && formatRetrievalChunk(articleTitle, combineUnits(previous, unit)).length <= targetSize
    ) {
      merged[merged.length - 1] = combineUnits(previous, unit)
      continue
    }

    merged.push(unit)
  }

  return merged
}

function combineUnits(left: ArticleUnit, right: ArticleUnit): ArticleUnit {
  return {
    sectionLabel: left.sectionLabel,
    stepLabel: left.stepLabel,
    text: joinTextUnits(left.text, right.text),
    userPhrases: uniqueStrings([...left.userPhrases, ...right.userPhrases]),
  }
}

function formatRetrievalChunk(articleTitle: string, unit: ArticleUnit) {
  const lines: string[] = []

  if (articleTitle && shouldIncludeArticleTitle(unit)) {
    lines.push(`Статья: ${articleTitle}`)
  }

  if (unit.sectionLabel) {
    lines.push(`Раздел: ${unit.sectionLabel}`)
  }

  if (unit.stepLabel) {
    lines.push(`Шаг: ${unit.stepLabel}`)
  }

  const intent = inferIntent(articleTitle, unit)

  if (intent) {
    lines.push(`Намерение: ${intent}`)
  }

  if (unit.userPhrases.length > 0) {
    const customerIntent = inferCustomerIntent(articleTitle, unit)

    if (customerIntent) {
      lines.push(customerIntent)
    }

    lines.push("Фразы клиента:")
    lines.push(...unit.userPhrases.map((phrase) => `- ${phrase}`))
  }

  const keywords = shouldIncludeKeywords(unit)
    ? extractKeywords([articleTitle, unit.sectionLabel ?? "", unit.text, ...unit.userPhrases].join(" "))
    : []

  if (keywords.length > 0) {
    lines.push(`Ключевые слова: ${keywords.join(", ")}`)
  }

  lines.push("")
  lines.push(unit.text)

  return normalizeUnitText(lines.join("\n"))
}

function splitLongRetrievalChunk(articleTitle: string, unit: ArticleUnit, chunkSize: number, overlap: number) {
  const chunks: string[] = []
  const contextUnit = {
    ...unit,
    text: "",
  }
  const contextPrefix = formatRetrievalChunk(articleTitle, contextUnit).trim()
  const availableSize = Math.max(200, chunkSize - contextPrefix.length - 2)

  for (const part of hardSplit(unit.text, availableSize, overlap)) {
    const chunk = normalizeUnitText(`${contextPrefix}\n\n${part}`)

    if (chunk.length <= chunkSize || part.length <= availableSize) {
      chunks.push(chunk)
    }
  }

  return chunks
}

function normalizeNewlines(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
}

function findFirstMeaningfulLine(text: string) {
  for (const line of normalizeNewlines(text).split("\n")) {
    const trimmed = line.trim()

    if (!trimmed || isHorizontalRule(trimmed)) {
      continue
    }

    const withoutBlockquote = stripBlockquoteMarker(trimmed).trim()

    if (!withoutBlockquote) {
      continue
    }

    return trimmed
  }

  return null
}

function canonicalTitle(text: string) {
  return stripBlockquoteMarker(text)
    .replace(/^#+\s*/, "")
    .replace(/:+\s*$/, "")
    .replace(/\*\*/g, "")
    .replace(/[ \t]+/g, " ")
    .trim()
    .toLowerCase()
}

function extractTextUnits(text: string) {
  const units: string[] = []
  let currentLines: string[] = []

  const flushCurrent = () => {
    const unit = normalizeUnitText(currentLines.join("\n"))

    if (unit) {
      units.push(unit)
    }

    currentLines = []
  }

  for (const line of normalizeNewlines(text).split("\n")) {
    const trimmed = line.trim()

    if (!trimmed) {
      flushCurrent()
      continue
    }

    if (isHorizontalRule(trimmed)) {
      flushCurrent()
      continue
    }

    const headingText = readSupportedHeading(trimmed)

    if (headingText) {
      flushCurrent()
      units.push(formatHeadingUnit(headingText))
      continue
    }

    const cleanLine = cleanMarkdownLine(line)

    if (cleanLine) {
      currentLines.push(cleanLine)
    }
  }

  flushCurrent()

  return units
}

function isHorizontalRule(text: string) {
  return /^-{3,}$/.test(text.trim())
}

function readSupportedHeading(text: string) {
  const match = text.match(/^#{1,3}\s+(.+)$/)

  if (!match) {
    return null
  }

  return normalizeSectionLabel(cleanMarkdownLine(match[1]))
}

function formatHeadingUnit(text: string) {
  const normalized = normalizeUnitText(text)

  if (!normalized) {
    return ""
  }

  return /[:：]$/.test(normalized) ? normalized : `${normalized}:`
}

function readSupportSectionLabel(text: string) {
  const cleaned = cleanSectionLine(text)
  const withoutColon = cleaned.replace(/[:：]\s*$/, "").trim()
  const canonical = withoutColon.toLowerCase()

  const knownLabels: Record<string, string> = {
    "когда использовать": "Когда использовать",
    "когда применять": "Когда использовать",
    "фразы клиента": "Фразы клиента",
    "что пишет клиент": "Фразы клиента",
    "что нужно сделать": "Что нужно сделать",
    "шаги": "Что нужно сделать",
    "важно": "Важно",
    "готовый ответ": "Готовый ответ клиенту",
    "готовый ответ клиенту": "Готовый ответ клиенту",
    "ответ клиенту": "Готовый ответ клиенту",
    "эскалация": "Эскалация",
    "когда эскалировать": "Эскалация",
  }

  return knownLabels[canonical] ?? null
}

function normalizeSectionLabel(text: string) {
  const supportLabel = readSupportSectionLabel(text)

  if (supportLabel) {
    return supportLabel
  }

  return cleanSectionLine(text).replace(/[:：]\s*$/, "").trim()
}

function readNumberedStep(text: string) {
  const match = stripBlockquoteMarker(text)
    .trim()
    .match(/^(\d{1,2})[.)]\s+(.+)$/)

  if (!match) {
    return null
  }

  return {
    label: `Step ${match[1]}`,
    text: cleanMarkdownLine(match[2]),
  }
}

function readUserPhrasesFromLine(text: string, sectionLabel: string | null) {
  if (!sectionLabel || !isUserPhraseSection(sectionLabel)) {
    return []
  }

  const phrase = text
    .replace(/^["'«»]+|["'«»]+$/g, "")
    .replace(/[.;]+$/g, "")
    .trim()

  if (
    !phrase
    || phrase.length > 120
    || /[:：]$/.test(phrase)
    || /^если\s+клиент\s+пишет/i.test(phrase)
  ) {
    return []
  }

  return [phrase]
}

function inferIntent(articleTitle: string, unit: ArticleUnit) {
  const unitSource = [unit.sectionLabel ?? "", unit.stepLabel ?? "", unit.text, ...unit.userPhrases].join(" ").toLowerCase()
  const source = [articleTitle, unitSource].join(" ").toLowerCase()

  if (isWarningSection(unit.sectionLabel)) {
    return "правила безопасности"
  }

  if (isReadyAnswerSection(unit.sectionLabel)) {
    return "готовый ответ клиенту"
  }

  if (/эскалац|оператор|менеджер|поддержк/.test(unitSource)) {
    return "передача обращения оператору"
  }

  if (/возврат|вернуть|refund/.test(unitSource)) {
    return "возврат средств"
  }

  if (/оплат|плат[её]ж|карт|деньг|списал/.test(source)) {
    return "клиент не может оплатить заказ"
  }

  return null
}

function inferCustomerIntent(articleTitle: string, unit: ArticleUnit) {
  const source = [articleTitle, unit.text, ...unit.userPhrases].join(" ").toLowerCase()

  if (/оплат|плат[её]ж|карт/.test(source)) {
    return "Клиент не может оплатить картой или сообщает об ошибке платежа."
  }

  if (/деньг|списал/.test(source)) {
    return "Клиент сообщает, что деньги списались или платёж завис."
  }

  return null
}

function shouldIncludeArticleTitle(unit: ArticleUnit) {
  return !isWarningSection(unit.sectionLabel)
}

function shouldIncludeKeywords(unit: ArticleUnit) {
  return !isWarningSection(unit.sectionLabel) && !isReadyAnswerSection(unit.sectionLabel)
}

function isUserPhraseSection(sectionLabel: string | null) {
  return sectionLabel === "Когда использовать" || sectionLabel === "Фразы клиента"
}

function isWarningSection(sectionLabel: string | null) {
  return sectionLabel === "Важно"
}

function isReadyAnswerSection(sectionLabel: string | null) {
  return sectionLabel === "Готовый ответ клиенту"
}

function extractKeywords(text: string) {
  const normalized = text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9\s-]/g, " ")

  const words = normalized
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !isStopWord(word))

  const keywordStems = [
    "оплат",
    "платеж",
    "карт",
    "деньг",
    "спис",
    "ошиб",
    "заказ",
    "возврат",
    "оператор",
    "эскалац",
    "поддерж",
    "cvv",
  ]

  const keywords: string[] = []

  for (const stem of keywordStems) {
    const word = words.find((item) => item.includes(stem))

    if (word) {
      keywords.push(word)
    }
  }

  return uniqueStrings(keywords).slice(0, 8)
}

function isStopWord(word: string) {
  return [
    "если",
    "когда",
    "нужно",
    "можно",
    "клиент",
    "клиента",
    "клиенту",
    "использовать",
    "проверить",
    "уточнить",
    "который",
    "другие",
    "после",
    "перед",
    "через",
    "this",
    "that",
    "with",
  ].includes(word)
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = normalizeInlineText(value)
    const key = normalized.toLowerCase()

    if (!normalized || seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(normalized)
  }

  return result
}

function cleanMarkdownLine(line: string) {
  let text = stripBlockquoteMarker(line.trim()).trim()

  if (!text || isHorizontalRule(text)) {
    return ""
  }

  text = text.replace(/^#+\s*/, "")
  text = text.replace(/^[-*+]\s+/, "")
  text = text.replace(/\*\*/g, "")
  text = text.replace(/[ \t]+/g, " ")

  return text.trim()
}

function cleanSectionLine(line: string) {
  return cleanMarkdownLine(line)
    .replace(/^[^0-9A-Za-zА-Яа-яЁё]+/, "")
    .replace(/[ \t]+/g, " ")
    .trim()
}

function normalizeInlineText(text: string) {
  return text.replace(/[ \t]+/g, " ").trim()
}

function stripBlockquoteMarker(text: string) {
  return text.replace(/^(>\s*)+/, "")
}

function normalizeUnitText(text: string) {
  return normalizeNewlines(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim()
}

function joinTextUnits(left: string, right: string) {
  return `${left.trim()}\n\n${right.trim()}`.trim()
}

function hardSplit(text: string, chunkSize: number, overlap: number) {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = chooseSplitEnd(text, start, chunkSize)
    const chunk = text.slice(start, end).trim()

    if (chunk) {
      chunks.push(chunk)
    }

    if (end === text.length) {
      break
    }

    start = chooseNextSplitStart(text, start, end, overlap)
  }

  return chunks
}

function chooseSplitEnd(text: string, start: number, chunkSize: number) {
  const maxEnd = Math.min(start + chunkSize, text.length)

  if (maxEnd === text.length) {
    return maxEnd
  }

  const minEnd = start + Math.floor(chunkSize * 0.5)
  const sentenceEnd = findLastSentenceEnd(text, start, maxEnd, minEnd)

  if (sentenceEnd) {
    return sentenceEnd
  }

  const whitespaceEnd = findLastWhitespaceEnd(text, start, maxEnd, minEnd)

  if (whitespaceEnd) {
    return whitespaceEnd
  }

  return maxEnd
}

function findLastSentenceEnd(text: string, start: number, maxEnd: number, minEnd: number) {
  for (let index = maxEnd - 1; index >= minEnd; index -= 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if ((char === "." || char === "!" || char === "?") && (!nextChar || /\s/.test(nextChar))) {
      return index + 1
    }
  }

  return null
}

function findLastWhitespaceEnd(text: string, start: number, maxEnd: number, minEnd: number) {
  for (let index = maxEnd - 1; index >= minEnd; index -= 1) {
    if (/\s/.test(text[index])) {
      return index
    }
  }

  return null
}

function chooseNextSplitStart(text: string, previousStart: number, previousEnd: number, overlap: number) {
  if (overlap <= 0) {
    return skipWhitespace(text, previousEnd)
  }

  let nextStart = Math.max(previousStart + 1, previousEnd - overlap)

  while (
    nextStart < previousEnd
    && nextStart > 0
    && !/\s/.test(text[nextStart - 1])
    && !/\s/.test(text[nextStart])
  ) {
    nextStart += 1
  }

  nextStart = skipWhitespace(text, nextStart)

  if (nextStart >= previousEnd) {
    return skipWhitespace(text, previousEnd)
  }

  return nextStart
}

function skipWhitespace(text: string, start: number) {
  let index = start

  while (index < text.length && /\s/.test(text[index])) {
    index += 1
  }

  return index
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
