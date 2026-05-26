import { config, workerPipelineVersion } from "./config.ts"
import { getErrorMessage } from "./errors.ts"
import { readPayload, type RequestPayload } from "./payload.ts"
import { getExpectedPipelineVersion } from "./rpc.ts"
import { fingerprintSecret } from "./utils.ts"
import { processSweep, processWebhook } from "./worker.ts"
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
    console.error("kb-ingestion unauthorized request:", JSON.stringify({
      has_expected_secret: Boolean(expectedSecret),
      has_x_internal_secret: Boolean(request.headers.get("x-internal-secret")),
      has_authorization: Boolean(request.headers.get("authorization")),
      expected_secret_length: expectedSecret?.length ?? 0,
      provided_secret_length: providedSecret?.length ?? 0,
      expected_secret_fingerprint: await fingerprintSecret(expectedSecret),
      provided_secret_fingerprint: await fingerprintSecret(providedSecret),
    }))
    return jsonResponse({ ok: false, type: "unauthorized" }, 401)
  }

  let payload: RequestPayload

  try {
    payload = await readPayload(request)
  } catch (error) {
    console.error("kb-ingestion invalid payload:", getErrorMessage(error))
    return jsonResponse({ ok: false, type: "invalid_payload" }, 400)
  }

  try {
    const expectedPipelineVersion = await getExpectedPipelineVersion()

    if (workerPipelineVersion !== expectedPipelineVersion) {
      console.error("kb-ingestion pipeline version mismatch:", JSON.stringify({
        worker_pipeline_version: workerPipelineVersion,
        expected_pipeline_version: expectedPipelineVersion,
      }))

      return jsonResponse({
        ok: false,
        type: "pipeline_version_mismatch",
        worker_pipeline_version: workerPipelineVersion,
        expected_pipeline_version: expectedPipelineVersion,
      })
    }

    if (payload.mode === "webhook") {
      const result = await processWebhook(payload, config, workerPipelineVersion)
      return jsonResponse(result)
    }

    const result = await processSweep(payload, config, workerPipelineVersion)
    return jsonResponse(result)
  } catch (error) {
    console.error("kb-ingestion request error:", getErrorMessage(error))
    return jsonResponse({ ok: false, type: "system_error" }, 500)
  }
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
