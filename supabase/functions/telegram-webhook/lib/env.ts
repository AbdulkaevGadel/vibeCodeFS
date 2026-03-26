export function getBotToken() {
  return Deno.env.get("BOT_TOKEN") ?? null
}

export function getSupabaseUrl() {
  return Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL") ?? null
}

export function getSupabaseServiceRoleKey() {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null
}
