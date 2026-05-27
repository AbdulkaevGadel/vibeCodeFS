import { safeProviderMessage } from "./embeddings.ts"
import { IngestionError } from "./errors.ts"
import { requireString } from "./utils.ts"

export type ArticlePayload = {
  id: string
  title: string
  content: string
  status: string
}

export type ClaimResult = {
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

export type ChunkPayload = {
  chunk_index: number
  chunk_text: string
  embedding: number[]
}

export async function getExpectedPipelineVersion() {
  const version = await callRpc<string>("get_kb_ingestion_pipeline_version_v1", {})

  return requireString(version, "expected_pipeline_version")
}

export async function claimChunkSetFromWebhook(options: {
  chunkSetId: string | undefined
  processingToken: string
  ingestionRunId: string
}) {
  return await callRpc<ClaimResult>("claim_kb_chunk_set_from_webhook", {
    p_chunk_set_id: options.chunkSetId,
    p_processing_token: options.processingToken,
    p_ingestion_run_id: options.ingestionRunId,
  })
}

export async function claimNextChunkSetForIngestion(options: {
  processingToken: string
  ingestionRunId: string
  staleProcessingSeconds: number
  retryAfterSeconds: number
  maxAttempts: number
}) {
  return await callRpc<ClaimResult>("claim_next_kb_chunk_set_for_ingestion", {
    p_processing_token: options.processingToken,
    p_ingestion_run_id: options.ingestionRunId,
    p_stale_after_seconds: options.staleProcessingSeconds,
    p_retry_after_seconds: options.retryAfterSeconds,
    p_max_attempts: options.maxAttempts,
  })
}

export async function heartbeat(chunkSetId: string, processingToken: string) {
  const result = await callRpc<Record<string, unknown>>("heartbeat_kb_chunk_set_ingestion", {
    p_chunk_set_id: chunkSetId,
    p_processing_token: processingToken,
  })

  if (result.type !== "heartbeat") {
    throw new IngestionError(`Heartbeat failed: ${String(result.type)}`, "system")
  }
}

export async function completeChunkSetIngestion(options: {
  chunkSetId: string
  processingToken: string
  contentChecksum: string
  ingestionPipelineVersion: string
  chunks: ChunkPayload[]
}) {
  return await callRpc<Record<string, unknown>>("complete_kb_chunk_set_ingestion", {
    p_chunk_set_id: options.chunkSetId,
    p_processing_token: options.processingToken,
    p_content_checksum: options.contentChecksum,
    p_ingestion_pipeline_version: options.ingestionPipelineVersion,
    p_chunks: options.chunks,
  })
}

export async function failChunkSetIngestion(options: {
  chunkSetId: string
  processingToken: string
  errorType: string
  errorMessage: string
}) {
  await callRpc("fail_kb_chunk_set_ingestion", {
    p_chunk_set_id: options.chunkSetId,
    p_processing_token: options.processingToken,
    p_error_type: options.errorType,
    p_error_message: options.errorMessage,
  })
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
