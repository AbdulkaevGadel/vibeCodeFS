import {
  getSupabaseServiceRoleKey as getSharedSupabaseServiceRoleKey,
  getSupabaseUrl as getSharedSupabaseUrl,
} from "../../_shared/supabase/env.ts"

export function getBotToken() {
  return Deno.env.get("BOT_TOKEN") ?? null
}

export function getSupabaseUrl() {
  return getSharedSupabaseUrl()
}

export function getSupabaseServiceRoleKey() {
  return getSharedSupabaseServiceRoleKey()
}

export function getInternalSecret() {
  return Deno.env.get("INTERNAL_SECRET") ?? null
}
