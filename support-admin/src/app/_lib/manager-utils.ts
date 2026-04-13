import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function getCurrentManagerId(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    throw new Error("User not authenticated");
  }

  const { data: manager, error: managerError } = await supabase
    .from("managers")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (managerError || !manager) {
    console.error("Manager record not found for auth user:", user.id);
    throw new Error("Manager profile not found. Please contact administrator.");
  }

  return manager.id;
}
