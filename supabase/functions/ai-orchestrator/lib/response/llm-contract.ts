import { OrchestratorError, safeProviderMessage } from "../errors.ts"
import type { LlmResponse, PromptMessage } from "../types.ts"
import { isRecord } from "../utils.ts"

export function parseLlmJson(content: string): LlmResponse {
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

export function strengthenPromptForJson(messages: PromptMessage[]): PromptMessage[] {
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
