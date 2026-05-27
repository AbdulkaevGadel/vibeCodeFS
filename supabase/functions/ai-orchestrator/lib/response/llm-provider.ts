import { config } from "../config.ts"
import {
  getErrorMessage,
  OrchestratorError,
  ProviderHttpError,
  ProviderTimeoutError,
  safeProviderMessage,
} from "../errors.ts"
import { parseLlmJson, strengthenPromptForJson } from "./llm-contract.ts"
import type { LlmResponse, PromptSnapshot } from "../types.ts"

export async function callLlm(promptSnapshot: PromptSnapshot): Promise<LlmResponse> {
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
