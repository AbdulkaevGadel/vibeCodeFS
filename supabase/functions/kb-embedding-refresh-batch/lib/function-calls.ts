export type IngestionResult = {
  ok?: boolean
  type?: string
  error_type?: string
}

export async function invokeKbIngestion(chunkSetId: string): Promise<IngestionResult> {
  const supabaseUrl = readSupabaseUrl()
  const internalSecret = readInternalSecretEnv()

  const response = await fetch(`${supabaseUrl}/functions/v1/kb-ingestion`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": internalSecret,
    },
    body: JSON.stringify({
      mode: "webhook",
      chunk_set_id: chunkSetId,
    }),
  })

  const responseText = await response.text()
  const body = parseJsonObject(responseText)

  if (!response.ok) {
    return {
      ok: false,
      type: `http_${response.status}`,
    }
  }

  return body as IngestionResult
}

export async function invokeSelf(batchId: string | null) {
  const supabaseUrl = readSupabaseUrl()
  const internalSecret = readInternalSecretEnv()

  const response = await fetch(`${supabaseUrl}/functions/v1/kb-embedding-refresh-batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": internalSecret,
    },
    body: JSON.stringify({
      batch_id: batchId,
    }),
  })

  if (!response.ok) {
    console.error("kb-embedding-refresh-batch self-resume failed:", JSON.stringify({
      status: response.status,
      body: await response.text(),
    }))
  }
}

function readInternalSecretEnv() {
  const internalSecret = Deno.env.get("INTERNAL_SECRET")?.trim()

  if (!internalSecret) {
    throw new Error("INTERNAL_SECRET is not configured")
  }

  return internalSecret
}

function readSupabaseUrl() {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL"))?.trim()

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is not configured")
  }

  return supabaseUrl.replace(/\/$/, "")
}

function parseJsonObject(value: string) {
  if (!value) {
    return {}
  }

  try {
    const parsed = JSON.parse(value)

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}
