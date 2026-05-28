import type { createSupabaseServerClient } from "@/shared/api/supabase/server-client";

export type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
