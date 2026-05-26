import { config } from "./config.ts"
import { readPayload, type RequestPayload } from "./payload.ts"
import { runWorker } from "./worker.ts"
import { getErrorMessage } from "./utils.ts"
import { jsonResponse } from "../_shared/http/responses.ts"

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
    console.error("kb-embedding-refresh-batch unauthorized request:", JSON.stringify({
      has_expected_secret: Boolean(expectedSecret),
      has_x_internal_secret: Boolean(request.headers.get("x-internal-secret")),
      has_authorization: Boolean(request.headers.get("authorization")),
    }))

    return jsonResponse({ ok: false, type: "unauthorized" }, 401)
  }

  let payload: RequestPayload

  try {
    payload = await readPayload(request)
  } catch (error) {
    console.error("kb-embedding-refresh-batch invalid payload:", getErrorMessage(error))
    return jsonResponse({ ok: false, type: "invalid_payload" }, 400)
  }

  EdgeRuntime.waitUntil(runWorker(payload, config))

  return jsonResponse({
    ok: true,
    type: "accepted",
    batch_id: payload.batch_id ?? null,
  }, 202)
})

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
