import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Manager } from "./page-types";

export async function getCurrentManagerId(): Promise<string> {
  const manager = await getCurrentManager();
  return manager.id;
}

export async function getCurrentManager(): Promise<Manager> {
  const supabase = await createSupabaseServerClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    throw new Error("User not authenticated");
  }

  const { data: manager, error: managerError } = await supabase
    .from("managers")
    .select("id, display_name, role")
    .eq("auth_user_id", user.id)
    .single();

  if (managerError || !manager) {
    console.error("Manager record not found for auth user:", user.id);
    throw new Error("Manager profile not found. Please contact administrator.");
  }

  return {
    id: manager.id,
    displayName: manager.display_name,
    role: manager.role as any,
  };
}
