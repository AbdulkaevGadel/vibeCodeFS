import { mapManagerRow, type Manager, type ManagerRow } from "@/entities/manager";
import { getCurrentManager } from "@/entities/manager/api/current-manager";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type ManagersAdminPageData = {
  currentManager: Manager | null;
  allManagers: Manager[];
  errorMessage: string | null;
};

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Неизвестная ошибка";
}

export async function getManagersAdminPageData(): Promise<ManagersAdminPageData> {
  let currentManager: Manager | null = null;
  let allManagers: Manager[] = [];
  let errorMessage: string | null = null;

  try {
    currentManager = await getCurrentManager();
  } catch (error) {
    errorMessage = `Ошибка авторизации: ${formatErrorMessage(error)}`;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("managers")
      .select("id, email, display_name, last_name, role")
      .order("display_name");

    if (error) {
      console.error("Fetch managers admin page managers error:", error);
      errorMessage = errorMessage ?? "Не удалось загрузить менеджеров.";
    } else {
      allManagers = ((data ?? []) as ManagerRow[]).map(mapManagerRow);
    }
  } catch (error) {
    console.error("Managers admin page data load failed:", error);
    errorMessage = errorMessage ?? "Ошибка при загрузке страницы менеджеров.";
  }

  return {
    currentManager,
    allManagers,
    errorMessage,
  };
}
