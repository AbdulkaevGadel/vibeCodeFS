const maxPayloadBytes = 2048

const config = {
  promptVersion: "phase-9-context-prompt-v1",
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
    enabled: true,
    builderVersion: "context-builder-v1",
    maxHistoryMessages: 8,
    maxClientHistoryMessages: 4,
    maxAiHistoryMessages: 4,
    maxHistoryAgeHours: 24,
    maxHistoryMessageChars: 800,
    maxKbFragments: 5,
    maxKbFragmentChars: 1200,
    maxPromptChars: 9000,
    maxCurrentMessageChars: 2000,
  },
  llm: {
    provider: "huggingface",
    model: Deno.env.get("LLM_MODEL")?.trim() || "Qwen/Qwen2.5-7B-Instruct-1M:cheapest",
    endpoint: Deno.env.get("LLM_ENDPOINT")?.trim() || "https://router.huggingface.co/v1/chat/completions",
    requestTimeoutMs: readIntegerEnv("LLM_REQUEST_TIMEOUT_MS", 20000, 1000, 60000),
    maxProviderRetries: readIntegerEnv("LLM_MAX_PROVIDER_RETRIES", 1, 0, 3),
    maxOutputTokens: readIntegerEnv("LLM_MAX_OUTPUT_TOKENS", 500, 100, 2000),
    temperature: readNumberEnv("LLM_TEMPERATURE", 0.2, 0, 2),
  },
  behavior: {
    mode: "ai_reply",
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

type PublishResult = RpcResult & {
  response_kind?: ResponseKind
  message_id?: string | null
  telegram_chat_id?: number | null
  text?: string | null
}

type TriggerMessage = {
  id: string
  chat_id: string
  text: string
  sender_type: string
  created_at: string
}

type RetrievalStatus = "hit" | "miss" | "empty" | "failed"
type ResponseKind = "answer" | "clarify" | "handoff"

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

type ChatMessageRow = {
  id: string
  chat_id: string
  text: string
  sender_type: "client" | "manager" | "ai" | "system"
  created_at: string
}

type KnowledgeChunkRow = {
  id: string
  article_id: string
  chunk_set_id: string
  chunk_index: number
  chunk_text: string
  content_checksum: string | null
  embedding_status: string
  ingestion_pipeline_version: string | null
  knowledge_chunk_sets?: KnowledgeChunkSetRow | KnowledgeChunkSetRow[]
  knowledge_base_articles?: KnowledgeArticleRow | KnowledgeArticleRow[]
}

type KnowledgeChunkSetRow = {
  status: string
  is_active: boolean
  content_checksum: string | null
  ingestion_pipeline_version: string | null
}

type KnowledgeArticleRow = {
  status: string
  title: string | null
  slug: string | null
}

type ContextSnapshot = {
  current_message: SnapshotMessage
  history_messages: SnapshotMessage[]
  kb_fragments: KbFragment[]
  limits: typeof config.context
  source_counts: {
    retrieved_chunks: number
    usable_chunks: number
    history_messages: number
    client_history_messages: number
    ai_history_messages: number
  }
}

type PromptSnapshot = {
  messages: PromptMessage[]
  prompt_version: string
  builder_version: string
  estimated_chars: number
}

type SnapshotMessage = {
  id: string
  sender_type: "client" | "ai"
  created_at: string
  text: string
  truncated: boolean
}

type KbFragment = {
  chunk_id: string
  article_id: string
  chunk_set_id: string
  chunk_index: number
  similarity_score: number
  article_title: string | null
  article_slug: string | null
  content_checksum: string | null
  ingestion_pipeline_version: string | null
  text: string
  truncated: boolean
}

type PromptMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

type ErrorType = "validation" | "external" | "system"

type LlmResponse =
  | { kind: "answer"; answer_text: string }
  | { kind: "insufficient" }

type ChatAiRunSummary = {
  response_kind: "none" | ResponseKind
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
  let retrievalResultSaved = false

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
      llm: {
        provider: config.llm.provider,
        model: config.llm.model,
        endpoint: config.llm.endpoint,
        requestTimeoutMs: config.llm.requestTimeoutMs,
        maxProviderRetries: config.llm.maxProviderRetries,
        maxOutputTokens: config.llm.maxOutputTokens,
        temperature: config.llm.temperature,
      },
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

    retrievalResultSaved = true

    let contextSnapshot: ContextSnapshot | null = null
    let promptSnapshot: PromptSnapshot | null = null

    if (retrievalResult.retrieval_status === "hit") {
      const snapshots = await buildContextAndPrompt(payload.trigger_message_id, retrievalResult)
      contextSnapshot = snapshots.contextSnapshot
      promptSnapshot = snapshots.promptSnapshot

      const snapshotResult = await callRpc<RpcResult>("save_chat_ai_context_prompt_snapshot", {
        p_run_id: runId,
        p_processing_token: processingToken,
        p_context_snapshot: contextSnapshot,
        p_prompt_snapshot: promptSnapshot,
      })

      if (snapshotResult.type !== "saved" && snapshotResult.type !== "already_saved") {
        return jsonResponse({
          ok: true,
          type: snapshotResult.type,
          run_id: runId,
        })
      }
    }

    if (retrievalResult.retrieval_status === "failed") {
      const finishResult = await callRpc<RpcResult>("finish_chat_ai_run", {
        p_run_id: runId,
        p_processing_token: processingToken,
        p_final_status: "failed",
        p_error_message: retrievalResult.error_message ?? "RETRIEVAL_FAILED",
        p_error_type: retrievalResult.error_type ?? "system",
      })

      return jsonResponse({
        ok: true,
        type: finishResult.type,
        status: finishResult.status,
        run_id: runId,
        retrieval_status: retrievalResult.retrieval_status,
      })
    }

    const branch = await decideResponseBranch(
      payload.chat_id,
      runId,
      retrievalResult,
      promptSnapshot,
    )
    const publishResult = await publishAiResponse(runId, processingToken, branch.kind, branch.text)

    if (publishResult.type === "published") {
      await deliverPublishedMessage(publishResult)
    }

    return jsonResponse({
      ok: true,
      type: publishResult.type,
      status: publishResult.status,
      run_id: runId,
      retrieval_status: retrievalResult.retrieval_status,
      response_kind: publishResult.response_kind ?? branch.kind,
      response_message_id: publishResult.message_id ?? null,
      matched_chunks_count: retrievalResult.matched_chunks_count,
      top_similarity_score: retrievalResult.top_similarity_score,
      context_snapshot_saved: contextSnapshot !== null,
      prompt_snapshot_saved: promptSnapshot !== null,
    })
  } catch (error) {
    console.error("ai-orchestrator error:", getErrorMessage(error))

    if (runId && processingToken) {
      if (!retrievalResultSaved) {
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
    `/rest/v1/chat_messages?id=eq.${encodeURIComponent(triggerMessageId)}&select=id,chat_id,text,sender_type,created_at&limit=1`,
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

async function buildContextAndPrompt(triggerMessageId: string, retrievalResult: RetrievalResult) {
  const triggerMessage = await fetchTriggerMessage(triggerMessageId)
  const [historyMessages, kbFragments] = await Promise.all([
    fetchRecentHistory(triggerMessage),
    fetchKbFragments(retrievalResult.chunks),
  ])

  if (kbFragments.length === 0) {
    throw new OrchestratorError("Retrieval hit has no usable KB fragments", "system")
  }

  const contextSnapshot = buildContextSnapshot(triggerMessage, historyMessages, kbFragments, retrievalResult)
  const promptSnapshot = buildPromptSnapshot(contextSnapshot)

  return { contextSnapshot, promptSnapshot }
}

async function decideResponseBranch(
  chatId: string,
  runId: string,
  retrievalResult: RetrievalResult,
  promptSnapshot: PromptSnapshot | null,
): Promise<{ kind: ResponseKind; text: string }> {
  if (retrievalResult.retrieval_status === "hit") {
    if (!promptSnapshot) {
      throw new OrchestratorError("Prompt snapshot is required for LLM answer", "system")
    }

    await sendTypingAction(chatId)

    const llmResponse = await callLlmWithRetry(promptSnapshot)

    if (llmResponse.kind === "answer") {
      const normalizedAnswer = normalizeVisibleText(llmResponse.answer_text)

      if (!normalizedAnswer) {
        throw new OrchestratorError("LLM answer text is empty", "external")
      }

      return {
        kind: "answer",
        text: await formatAnswerText(chatId, normalizedAnswer),
      }
    }
  }

  return await decideBusinessMissBranch(chatId, runId)
}

async function decideBusinessMissBranch(chatId: string, runId: string): Promise<{ kind: ResponseKind; text: string }> {
  const previousMissCount = await fetchConsecutiveBusinessMissCount(chatId, runId)
  const isFirstAiMessage = await isFirstAiMessageInChat(chatId)

  if (previousMissCount >= 1) {
    return {
      kind: "handoff",
      text: isFirstAiMessage
        ? "На связи ИИ-помощник службы поддержки. Я всё ещё не нашёл достаточно точной информации в базе знаний. Передаю чат оператору службы поддержки."
        : "ИИ-помощник: Я всё ещё не нашёл достаточно точной информации в базе знаний. Передаю чат оператору службы поддержки.",
    }
  }

  return {
    kind: "clarify",
    text: isFirstAiMessage
      ? "На связи ИИ-помощник службы поддержки. Я не нашёл достаточно точной информации в базе знаний. Попробуйте, пожалуйста, переформулировать вопрос или добавить детали."
      : "ИИ-помощник: Я не нашёл достаточно точной информации в базе знаний. Попробуйте, пожалуйста, переформулировать вопрос или добавить детали.",
  }
}

async function fetchConsecutiveBusinessMissCount(chatId: string, runId: string) {
  const query = [
    `chat_id=eq.${encodeURIComponent(chatId)}`,
    `id=neq.${encodeURIComponent(runId)}`,
    "status=eq.completed",
    "response_kind=in.(answer,clarify,handoff)",
    "select=response_kind",
    "order=completed_at.desc,created_at.desc",
    "limit=10",
  ].join("&")
  const rows = await callRest<ChatAiRunSummary[]>(`/rest/v1/chat_ai_runs?${query}`)
  let count = 0

  for (const row of rows) {
    if (row.response_kind === "answer") {
      break
    }

    if (row.response_kind === "clarify" || row.response_kind === "handoff") {
      count += 1
    }
  }

  return count
}

async function isFirstAiMessageInChat(chatId: string) {
  const rows = await callRest<{ id: string }[]>(
    `/rest/v1/chat_messages?chat_id=eq.${encodeURIComponent(chatId)}&sender_type=eq.ai&select=id&limit=1`,
  )

  return rows.length === 0
}

async function formatAnswerText(chatId: string, answerText: string) {
  const isFirstAiMessage = await isFirstAiMessageInChat(chatId)

  if (isFirstAiMessage) {
    return `На связи ИИ-помощник службы поддержки.\n\n${answerText}`
  }

  return `ИИ-помощник: ${answerText}`
}

async function publishAiResponse(
  runId: string,
  processingToken: string,
  responseKind: ResponseKind,
  text: string,
) {
  return await callRpc<PublishResult>("publish_chat_ai_response", {
    p_run_id: runId,
    p_processing_token: processingToken,
    p_response_kind: responseKind,
    p_text: text,
  })
}

async function deliverPublishedMessage(publishResult: PublishResult) {
  if (!publishResult.message_id || !publishResult.telegram_chat_id || !publishResult.text) {
    throw new OrchestratorError("Publish RPC returned incomplete delivery payload", "system")
  }

  const deliveryResult = await sendTelegramMessage(publishResult.telegram_chat_id, publishResult.text)

  try {
    await updateMessageDeliveryStatus(
      publishResult.message_id,
      deliveryResult.ok ? "sent" : "failed",
      deliveryResult.error,
    )
  } catch (error) {
    console.error("Failed to update AI message delivery status:", getErrorMessage(error))
  }
}

async function callLlmWithRetry(promptSnapshot: PromptSnapshot): Promise<LlmResponse> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= config.llm.maxProviderRetries; attempt += 1) {
    try {
      return await callLlm(promptSnapshot)
    } catch (error) {
      lastError = error

      if (!isRetryableProviderError(error) || attempt >= config.llm.maxProviderRetries) {
        break
      }

      await delay(500 + attempt * 500)
    }
  }

  if (lastError instanceof OrchestratorError) {
    throw lastError
  }

  throw new OrchestratorError(`LLM request failed: ${getErrorMessage(lastError)}`, "external")
}

async function callLlm(promptSnapshot: PromptSnapshot): Promise<LlmResponse> {
  const token = Deno.env.get("HF_LLM_API_TOKEN")?.trim()

  if (!token) {
    throw new OrchestratorError("HF_LLM_API_TOKEN is not configured", "validation")
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), config.llm.requestTimeoutMs)

  try {
    const response = await fetch(config.llm.endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: config.llm.model,
        messages: strengthenPromptForJson(promptSnapshot.messages),
        temperature: config.llm.temperature,
        max_tokens: config.llm.maxOutputTokens,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "supportbot_ai_response",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                kind: {
                  type: "string",
                  enum: ["answer", "insufficient"],
                },
                answer_text: {
                  type: "string",
                },
              },
              required: ["kind", "answer_text"],
            },
          },
        },
      }),
    })

    const responseText = await response.text()

    if (!response.ok) {
      throw new ProviderHttpError(response.status, safeProviderMessage(responseText))
    }

    const parsed = JSON.parse(responseText) as {
      choices?: Array<{ message?: { content?: unknown } }>
    }
    const content = parsed.choices?.[0]?.message?.content

    if (typeof content !== "string") {
      throw new OrchestratorError("LLM response content is missing", "external")
    }

    return parseLlmJson(content)
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ProviderTimeoutError("LLM request timed out")
    }

    if (error instanceof ProviderHttpError || error instanceof OrchestratorError) {
      throw error
    }

    throw new OrchestratorError(`LLM request failed: ${getErrorMessage(error)}`, "external")
  } finally {
    clearTimeout(timeoutId)
  }
}

function strengthenPromptForJson(messages: PromptMessage[]): PromptMessage[] {
  const jsonContract = [
    "Output contract is strict.",
    "Return only one raw JSON object and nothing else.",
    "Do not wrap JSON in markdown or code fences.",
    "Do not add explanations before or after JSON.",
    "Allowed shapes:",
    '{"kind":"answer","answer_text":"..."}',
    '{"kind":"insufficient","answer_text":""}',
    "For kind=answer, answer_text is required and must be a non-empty Russian support answer.",
    "For kind=insufficient, answer_text must be an empty string.",
    "Never return {\"kind\":\"answer\"} without answer_text.",
    "Use kind=insufficient when KB fragments do not contain enough information.",
  ].join("\n")

  const [firstMessage, ...restMessages] = messages

  if (!firstMessage || firstMessage.role !== "system") {
    return [
      {
        role: "system",
        content: jsonContract,
      },
      ...messages,
    ]
  }

  return [
    {
      ...firstMessage,
      content: `${firstMessage.content}\n\n${jsonContract}`,
    },
    ...restMessages,
  ]
}

function parseLlmJson(content: string): LlmResponse {
  let parsed: unknown
  const jsonText = extractJsonObjectText(content)

  try {
    parsed = JSON.parse(jsonText)
  } catch (_error) {
    throw new OrchestratorError(`LLM response is not valid JSON: ${previewLlmContent(content)}`, "external")
  }

  if (!isRecord(parsed)) {
    throw new OrchestratorError(`LLM JSON response is not an object: ${previewLlmContent(content)}`, "external")
  }

  if (parsed.kind === "insufficient") {
    return { kind: "insufficient" }
  }

  if (parsed.kind === "answer" && typeof parsed.answer_text === "string" && parsed.answer_text.trim()) {
    return {
      kind: "answer",
      answer_text: parsed.answer_text,
    }
  }

  throw new OrchestratorError(`LLM JSON response does not match contract: ${previewLlmContent(jsonText)}`, "external")
}

function extractJsonObjectText(content: string) {
  const trimmed = content.trim()
  const fencedJsonMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)

  if (fencedJsonMatch?.[1]) {
    return fencedJsonMatch[1].trim()
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed
  }

  const startIndex = trimmed.indexOf("{")
  const endIndex = trimmed.lastIndexOf("}")

  if (startIndex >= 0 && endIndex > startIndex) {
    return trimmed.slice(startIndex, endIndex + 1)
  }

  return trimmed
}

function previewLlmContent(content: string) {
  return safeProviderMessage(content)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300)
}

async function sendTypingAction(chatId: string) {
  try {
    const rows = await callRest<Array<{ telegram_chat_id: number }>>(
      `/rest/v1/chats?id=eq.${encodeURIComponent(chatId)}&select=telegram_chat_id&limit=1`,
    )
    const telegramChatId = rows[0]?.telegram_chat_id

    if (!telegramChatId) {
      return
    }

    const botToken = Deno.env.get("BOT_TOKEN")?.trim()

    if (!botToken) {
      return
    }

    await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramChatId,
        action: "typing",
      }),
    })
  } catch (error) {
    console.error("sendTypingAction failed:", getErrorMessage(error))
  }
}

async function sendTelegramMessage(telegramChatId: number, text: string) {
  const botToken = Deno.env.get("BOT_TOKEN")?.trim()

  if (!botToken) {
    return { ok: false, error: "BOT_TOKEN is not configured" }
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text,
      }),
    })
    const responseText = await response.text()
    const parsed = parseMaybeJson(responseText)

    if (!response.ok || !isTelegramOk(parsed)) {
      const description = isRecord(parsed) && typeof parsed.description === "string"
        ? parsed.description
        : `Telegram API error ${response.status}`

      return { ok: false, error: safeProviderMessage(description) }
    }

    return { ok: true, error: null }
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) }
  }
}

async function updateMessageDeliveryStatus(messageId: string, status: "sent" | "failed", error: string | null) {
  await callRest<unknown>(`/rest/v1/chat_messages?id=eq.${encodeURIComponent(messageId)}&delivery_status=eq.pending`, {
    method: "PATCH",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      delivery_status: status,
      delivery_error: error,
    }),
  })
}

async function fetchRecentHistory(triggerMessage: TriggerMessage): Promise<ChatMessageRow[]> {
  const oldestHistoryDate = new Date(triggerMessage.created_at)
  oldestHistoryDate.setHours(oldestHistoryDate.getHours() - config.context.maxHistoryAgeHours)

  const query = [
    `chat_id=eq.${encodeURIComponent(triggerMessage.chat_id)}`,
    `created_at=gte.${encodeURIComponent(oldestHistoryDate.toISOString())}`,
    `created_at=lte.${encodeURIComponent(triggerMessage.created_at)}`,
    `id=neq.${encodeURIComponent(triggerMessage.id)}`,
    "sender_type=in.(client,ai)",
    "select=id,chat_id,text,sender_type,created_at",
    "order=created_at.desc,id.desc",
    "limit=24",
  ].join("&")

  const rows = await callRest<ChatMessageRow[]>(`/rest/v1/chat_messages?${query}`)
  const selected: ChatMessageRow[] = []
  let clientCount = 0
  let aiCount = 0

  for (const row of rows) {
    if (selected.length >= config.context.maxHistoryMessages) {
      break
    }

    if (row.sender_type === "client") {
      if (clientCount >= config.context.maxClientHistoryMessages) {
        continue
      }

      clientCount += 1
      selected.push(row)
      continue
    }

    if (row.sender_type === "ai") {
      if (aiCount >= config.context.maxAiHistoryMessages) {
        continue
      }

      aiCount += 1
      selected.push(row)
    }
  }

  return selected.reverse()
}

async function fetchKbFragments(retrievalChunks: RetrievalChunk[]): Promise<KbFragment[]> {
  const requestedChunks = retrievalChunks.slice(0, config.context.maxKbFragments)
  const chunkIds = requestedChunks.map((chunk) => chunk.chunk_id)

  if (chunkIds.length === 0) {
    return []
  }

  const query = [
    `id=in.(${chunkIds.map(encodeURIComponent).join(",")})`,
    "select=id,article_id,chunk_set_id,chunk_index,chunk_text,content_checksum,embedding_status,ingestion_pipeline_version,knowledge_chunk_sets!inner(status,is_active,content_checksum,ingestion_pipeline_version),knowledge_base_articles!inner(status,title,slug)",
  ].join("&")

  const rows = await callRest<KnowledgeChunkRow[]>(`/rest/v1/knowledge_chunks?${query}`)
  const rowsById = new Map(rows.map((row) => [row.id, row]))
  const fragments: KbFragment[] = []

  for (const retrievalChunk of requestedChunks) {
    const row = rowsById.get(retrievalChunk.chunk_id)

    if (!row) {
      continue
    }

    const chunkSet = firstRelation(row.knowledge_chunk_sets)
    const article = firstRelation(row.knowledge_base_articles)

    if (!chunkSet || !article) {
      continue
    }

    if (
      chunkSet.is_active !== true
      || chunkSet.status !== "completed"
      || row.embedding_status !== "completed"
      || article.status !== "published"
    ) {
      continue
    }

    const truncatedText = truncateText(row.chunk_text, config.context.maxKbFragmentChars)

    fragments.push({
      chunk_id: row.id,
      article_id: row.article_id,
      chunk_set_id: row.chunk_set_id,
      chunk_index: row.chunk_index,
      similarity_score: retrievalChunk.similarity_score,
      article_title: article.title,
      article_slug: article.slug,
      content_checksum: row.content_checksum ?? chunkSet.content_checksum,
      ingestion_pipeline_version: row.ingestion_pipeline_version ?? chunkSet.ingestion_pipeline_version,
      text: truncatedText.text,
      truncated: truncatedText.truncated,
    })
  }

  return fragments
}

function buildContextSnapshot(
  triggerMessage: TriggerMessage,
  historyMessages: ChatMessageRow[],
  kbFragments: KbFragment[],
  retrievalResult: RetrievalResult,
): ContextSnapshot {
  const currentMessageText = truncateText(triggerMessage.text, config.context.maxCurrentMessageChars)
  const historySnapshot = historyMessages.map((message) => {
    const text = truncateText(message.text, config.context.maxHistoryMessageChars)

    return {
      id: message.id,
      sender_type: message.sender_type as "client" | "ai",
      created_at: message.created_at,
      text: text.text,
      truncated: text.truncated,
    }
  })

  return {
    current_message: {
      id: triggerMessage.id,
      sender_type: "client",
      created_at: triggerMessage.created_at,
      text: currentMessageText.text,
      truncated: currentMessageText.truncated,
    },
    history_messages: historySnapshot,
    kb_fragments: fitKbFragmentsToBudget(historySnapshot, kbFragments, currentMessageText.text),
    limits: config.context,
    source_counts: {
      retrieved_chunks: retrievalResult.chunks.length,
      usable_chunks: kbFragments.length,
      history_messages: historySnapshot.length,
      client_history_messages: historySnapshot.filter((message) => message.sender_type === "client").length,
      ai_history_messages: historySnapshot.filter((message) => message.sender_type === "ai").length,
    },
  }
}

function buildPromptSnapshot(contextSnapshot: ContextSnapshot): PromptSnapshot {
  const historyText = contextSnapshot.history_messages.length > 0
    ? contextSnapshot.history_messages.map(formatHistoryMessage).join("\n")
    : "Нет предыдущего client/ai контекста."

  const kbText = contextSnapshot.kb_fragments.map(formatKbFragment).join("\n\n")

  const messages: PromptMessage[] = [
    {
      role: "system",
      content: [
        "Ты backend-only AI assistant службы поддержки.",
        "Отвечай только на основе KB fragments.",
        "Если в KB fragments нет достаточной информации, скажи, что данных недостаточно.",
        "Не придумывай правила, сроки, статусы, цены или обещания.",
        "Не принимай workflow decisions вроде handoff.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "Current client message:",
        contextSnapshot.current_message.text,
        "",
        "Recent client/ai history:",
        historyText,
        "",
        "KB fragments:",
        kbText,
      ].join("\n"),
    },
  ]

  return {
    messages,
    prompt_version: config.promptVersion,
    builder_version: config.context.builderVersion,
    estimated_chars: messages.reduce((sum, message) => sum + message.content.length, 0),
  }
}

function fitKbFragmentsToBudget(
  historyMessages: SnapshotMessage[],
  kbFragments: KbFragment[],
  currentMessageText: string,
) {
  const baseSize = currentMessageText.length
    + historyMessages.reduce((sum, message) => sum + message.text.length, 0)
    + 1200

  let totalSize = baseSize
  const selected: KbFragment[] = []

  for (const fragment of kbFragments) {
    const nextSize = totalSize + fragment.text.length + 200

    if (nextSize > config.context.maxPromptChars && selected.length > 0) {
      break
    }

    selected.push(fragment)
    totalSize = nextSize
  }

  return selected
}

function formatHistoryMessage(message: SnapshotMessage) {
  const role = message.sender_type === "client" ? "client" : "ai"

  return `[${role} ${message.created_at}] ${message.text}`
}

function formatKbFragment(fragment: KbFragment) {
  return [
    `[fragment chunk_id=${fragment.chunk_id} article_id=${fragment.article_id} chunk_index=${fragment.chunk_index}]`,
    fragment.text,
  ].join("\n")
}

function firstRelation<T>(value: T | T[] | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
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

  const responseText = await response.text()

  if (!responseText) {
    return null as T
  }

  return JSON.parse(responseText) as T
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

function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return { text: value, truncated: false }
  }

  return {
    text: value.slice(0, Math.max(0, maxChars - 20)).trimEnd() + "\n[truncated]",
    truncated: true,
  }
}

function normalizeVisibleText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 3800)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseMaybeJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch (_error) {
    return null
  }
}

function isTelegramOk(value: unknown) {
  return isRecord(value) && value.ok === true
}

function isRetryableProviderError(error: unknown) {
  if (error instanceof ProviderTimeoutError) {
    return true
  }

  if (error instanceof ProviderHttpError) {
    return error.status === 429 || error.status >= 500
  }

  return false
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

class ProviderHttpError extends OrchestratorError {
  status: number

  constructor(status: number, providerMessage: string) {
    super(`LLM provider request failed with status ${status}: ${providerMessage}`, "external")
    this.name = "ProviderHttpError"
    this.status = status
  }
}

class ProviderTimeoutError extends OrchestratorError {
  constructor(message: string) {
    super(message, "external")
    this.name = "ProviderTimeoutError"
  }
}
