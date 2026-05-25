export function getSupabaseUrl(): string | null {
  return (Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL"))?.trim() || null
}

export function getSupabaseServiceRoleKey(): string | null {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || null
}

export function getRequiredSupabaseServiceRoleConfig(): {
  supabaseUrl: string
  serviceRoleKey: string
} {
  const supabaseUrl = getSupabaseUrl()
  const serviceRoleKey = getSupabaseServiceRoleKey()

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is not configured")
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured")
  }

  return { supabaseUrl, serviceRoleKey }
}

