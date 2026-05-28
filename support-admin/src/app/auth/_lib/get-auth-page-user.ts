import { createSupabaseServerClient } from "@/shared/api/supabase/server-client";

export async function getAuthPageUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  return {
    user: data.user,
    error,
  };
}
