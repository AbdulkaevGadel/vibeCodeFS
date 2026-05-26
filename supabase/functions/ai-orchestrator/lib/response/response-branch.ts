import { decideBusinessMissBranch } from "./business-miss-branch.ts"
import { OrchestratorError } from "../errors.ts"
import { callLlmWithRetry } from "./llm.ts"
import { formatAnswerText } from "./response-text.ts"
import { sendTypingAction } from "./telegram-delivery.ts"
import type {
  PromptSnapshot,
  ResponseBranch,
  RetrievalResult,
} from "../types.ts"
import { normalizeVisibleText } from "../utils.ts"

export async function decideResponseBranch(
  chatId: string,
  runId: string,
  retrievalResult: RetrievalResult,
  promptSnapshot: PromptSnapshot | null,
  triggerMessageText: string,
): Promise<ResponseBranch> {
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
        text: await formatAnswerText(chatId, normalizedAnswer, triggerMessageText),
      }
    }
  }

  return await decideBusinessMissBranch(chatId, runId)
}
