import { mapManagerRow, type Manager } from "@/entities/manager";
import type { SupabaseServerClient } from "./types";

export async function loadKnowledgeManagers(supabase: SupabaseServerClient): Promise<Manager[]> {
  const { data, error } = await supabase
    .from("managers")
    .select("id, email, display_name, last_name, role")
    .order("display_name");

  if (error) {
    console.error("Fetch managers error:", error);
    return [];
  }

  return (data ?? []).map(mapManagerRow);
}
