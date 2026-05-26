import { jsonResponse } from "../_shared/http/responses.ts"
import { getErrorMessage } from "./lib/errors.ts"
import { readPayload, type OrchestratorPayload } from "./lib/payload.ts"
import { processAiRun } from "./lib/workflow.ts"

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

  try {
    payload = await readPayload(request)
  } catch (error) {
    console.error("ai-orchestrator invalid payload:", getErrorMessage(error))
    return jsonResponse({ ok: false, type: "invalid_payload" }, 400)
  }

  const correlationId = payload.correlation_id ?? crypto.randomUUID()

  EdgeRuntime.waitUntil(
    processAiRun(payload, correlationId).then((result) => {
      console.log("ai-orchestrator background flow finished:", JSON.stringify({
        correlation_id: correlationId,
        type: result.type,
        status: result.status,
        run_id: result.run_id,
        current_stage: result.current_stage,
      }))
    }).catch((error) => {
      console.error("ai-orchestrator background flow failed:", JSON.stringify({
        correlation_id: correlationId,
        error: getErrorMessage(error),
      }))
    }),
  )

  return jsonResponse({
    ok: true,
    type: "scheduled",
    correlation_id: correlationId,
  })
})
