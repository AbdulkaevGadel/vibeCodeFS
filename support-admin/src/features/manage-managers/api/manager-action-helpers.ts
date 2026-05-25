import { createSupabaseServerClient } from "@/lib/supabase-server";
import type {
  ManageManagersActionResult,
  ManagerAccountRecovery,
} from "../model";

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createErrorResult(error: string): ManageManagersActionResult {
  return {
    success: false,
    error,
    recovery: null,
  };
}

export function createSuccessResult(): ManageManagersActionResult {
  return {
    success: true,
    error: null,
    recovery: null,
  };
}

export function createRecoveryResult(
  error: string,
  recovery: ManagerAccountRecovery,
): ManageManagersActionResult {
  return {
    success: false,
    error,
    recovery,
  };
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeNullableText(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function requireCurrentAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Нужно войти в админ-панель.");
  }

  const { data: manager, error: managerError } = await supabase
    .from("managers")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();

  if (managerError || !manager) {
    throw new Error("Профиль менеджера не найден.");
  }

  if (manager.role !== "admin") {
    throw new Error("Только admin может управлять пользователями и менеджерами.");
  }

  return manager;
}
