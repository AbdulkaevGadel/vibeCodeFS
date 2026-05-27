import { jsonResponse } from "../../_shared/http/responses.ts"

export function createSuccessResponse() {
  return jsonResponse({ ok: true })
}
