import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function getAuthPageUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  return {
    user: data.user,
    error,
  };
}
