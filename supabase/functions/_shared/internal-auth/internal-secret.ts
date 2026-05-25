export type InternalSecretValidationResult =
  | { ok: true }
  | { ok: false; reason: "missing_expected_secret" | "missing_provided_secret" | "invalid_secret" }

const internalSecretHeaderName = "x-internal-secret"

export function validateInternalSecret(request: Request): InternalSecretValidationResult {
  const expectedSecret = Deno.env.get("INTERNAL_SECRET")?.trim()

  if (!expectedSecret) {
    return { ok: false, reason: "missing_expected_secret" }
  }

  const providedSecret = request.headers.get(internalSecretHeaderName)?.trim()

  if (!providedSecret) {
    return { ok: false, reason: "missing_provided_secret" }
  }

  if (providedSecret !== expectedSecret) {
    return { ok: false, reason: "invalid_secret" }
  }

  return { ok: true }
}

