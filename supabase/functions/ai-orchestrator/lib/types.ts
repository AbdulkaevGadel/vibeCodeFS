import type { config } from "./config.ts"
import type { ErrorType } from "./errors.ts"

export type RpcResult = {
  type?: string
  run_id?: string | null
  status?: string
}

export type ResponseKind = "answer" | "clarify" | "handoff" | "intent_reply" | "technical_fallback"

export type AiRunStage =
  | "processing_marked"
  | "trigger_loaded"
  | "retrieval_started"
  | "embedding_started"
  | "embedding_finished"
  | "retrieval_rpc_started"
  | "retrieval_saved"
  | "failed"

export type TriggerMessage = {
  id: string
  chat_id: string
  text: string
  sender_type: string
  created_at: string
}

export type RetrievalStatus = "hit" | "miss" | "empty" | "failed"
export type IntentType = "greeting" | "thanks" | "farewell" | "manager_request"

export type RetrievalChunk = {
  chunk_id: string
  article_id: string
  chunk_index: number
  similarity_score: number
  match_source?: "vector" | "fts" | "trigram" | "hybrid" | null
  vector_similarity_score?: number | null
  fts_score?: number | null
  trigram_score?: number | null
  retrieval_rank?: number | null
}

export type RetrievalResult = {
  retrieval_status: RetrievalStatus
  top_similarity_score: number | null
  matched_chunks_count: number
  chunks: RetrievalChunk[]
  error_type?: ErrorType
  error_message?: string
}

export type PersistedRetrievalResult = RetrievalResult & RpcResult

export type ContextSnapshot = {
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

export type PromptSnapshot = {
  messages: PromptMessage[]
  prompt_version: string
  builder_version: string
  estimated_chars: number
}

export type SnapshotMessage = {
  id: string
  sender_type: "client" | "ai"
  created_at: string
  text: string
  truncated: boolean
}

export type KbFragment = {
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

export type PromptMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export type LlmResponse =
  | { kind: "answer"; answer_text: string }
  | { kind: "insufficient" }

export type PublishResult = RpcResult & {
  response_kind?: ResponseKind
  message_id?: string | null
  telegram_chat_id?: number | null
  text?: string | null
}

export type ResponseBranch = {
  kind: ResponseKind
  text: string
}
