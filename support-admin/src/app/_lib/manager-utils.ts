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
    .select("id, email, display_name, last_name, role")
    .eq("auth_user_id", user.id)
    .single();

  if (managerError || !manager) {
    throw new Error("Профиль менеджера не найден. Обратитесь к администратору.");
  }

  return {
    id: manager.id,
    email: manager.email,
    displayName: manager.display_name,
    lastName: manager.last_name,
    role: manager.role as any,
  };
}
