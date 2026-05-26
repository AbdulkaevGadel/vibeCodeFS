import { OrchestratorError, safeProviderMessage } from "./errors.ts"

export async function callRpc<T>(name: string, body: Record<string, unknown>, init?: RequestInit): Promise<T> {
  return await callRest<T>(`/rest/v1/rpc/${name}`, {
    ...init,
    method: "POST",
    body: JSON.stringify(body),
  })
}

export async function callRest<T>(path: string, init?: RequestInit): Promise<T> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !serviceRoleKey) {
    throw new OrchestratorError("Supabase env is not configured", "validation")
  }

  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new OrchestratorError(`Supabase request failed ${response.status}: ${safeProviderMessage(errorText)}`, "system")
  }

  const responseText = await response.text()

  if (!responseText) {
    return null as T
  }

  return JSON.parse(responseText) as T
}
