export type ClaimResult = {
  type: string
  item_id?: string
  batch_id?: string
  article_id?: string
  article_title?: string
  article_version?: number
  attempt_count?: number
  processing_token?: string
}

export type RefreshResult = {
  type: string
  chunk_set_id?: string | null
  result_type?: string | null
}

export type ChunkSetStatusResult = {
  type: string
  status?: string
  is_active?: boolean
  last_error_type?: string | null
  error_message?: string | null
}

export async function claimNextBatchItem(options: {
  processingToken: string
  staleProcessingSeconds: number
  maxAttempts: number
}) {
  return await callRpc<ClaimResult>("claim_next_kb_embedding_refresh_batch_item_v1", {
    p_processing_token: options.processingToken,
    p_stale_after_seconds: options.staleProcessingSeconds,
    p_max_attempts: options.maxAttempts,
  })
}

export async function requestEmbeddingRefresh(itemId: string, processingToken: string) {
  return await callRpc<RefreshResult>("request_kb_embedding_refresh_for_batch_item_v1", {
    p_item_id: itemId,
    p_processing_token: processingToken,
  })
}

export async function readChunkSetStatus(chunkSetId: string) {
  return await callRpc<ChunkSetStatusResult>("get_kb_chunk_set_status_v1", {
    p_chunk_set_id: chunkSetId,
  })
}

export async function finishItem(
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

function readSupabaseUrl() {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL"))?.trim()

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is not configured")
  }

  return supabaseUrl.replace(/\/$/, "")
}

function safeLogMessage(value: string) {
  return value.replace(/hf_[A-Za-z0-9_-]+/g, "hf_***").slice(0, 500)
}
