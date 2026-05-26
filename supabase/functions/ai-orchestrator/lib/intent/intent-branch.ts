import {
  buildIntentResponseBranch,
} from "./intent-response.ts"
import { saveIntentResult } from "../run/rpc.ts"
import {
  deliverPublishedMessage,
  publishAiResponse,
} from "../response/telegram-delivery.ts"
import type { IntentType } from "../types.ts"

type ProcessIntentBranchParams = {
  chatId: string
  runId: string
  processingToken: string
  intentType: IntentType
  markAiResultRecorded: () => void
}

export async function processIntentBranch({
  chatId,
  runId,
  processingToken,
  intentType,
  markAiResultRecorded,
}: ProcessIntentBranchParams): Promise<Record<string, unknown>> {
  const intentSaveResult = await saveIntentResult(runId, processingToken, intentType)

  if (intentSaveResult.type !== "saved" && intentSaveResult.type !== "already_saved") {
    return {
      ok: true,
      type: intentSaveResult.type,
      run_id: runId,
    }
  }

  markAiResultRecorded()

  const branch = await buildIntentResponseBranch(chatId, intentType)
  const publishResult = await publishAiResponse(runId, processingToken, branch.kind, branch.text)

  if (publishResult.type === "published") {
    await deliverPublishedMessage(publishResult)
  }

  return {
    ok: true,
    type: publishResult.type,
    status: publishResult.status,
    run_id: runId,
    retrieval_status: "skipped",
    response_kind: publishResult.response_kind ?? branch.kind,
    response_message_id: publishResult.message_id ?? null,
    intent_type: intentType,
    matched_chunks_count: 0,
    top_similarity_score: null,
    context_snapshot_saved: false,
    prompt_snapshot_saved: false,
  }
}
