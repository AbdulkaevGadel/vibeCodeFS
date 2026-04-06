"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export type ResetPasswordActionResult = {
  success: boolean;
  error: string | null;
  debugReason: string | null;
  debugDetails: string[];
};

export type ResetPasswordFormState = {
  error: string | null;
  debugReason: string | null;
  debugDetails: string[];
};

const minimumPasswordLength = 8;

function createErrorResult(error: string): ResetPasswordActionResult {
  return {
    success: false,
    error,
    debugReason: null,
    debugDetails: [],
  };
}

function validatePassword(password: string) {
  if (!password.trim()) {
    return "Введите новый пароль.";
  }

  if (password.length < minimumPasswordLength) {
    return `Пароль должен быть не короче ${minimumPasswordLength} символов.`;
  }

  return null;
}

function mapResetPasswordError(message?: string) {
  if (!message) {
    return "Не удалось обновить пароль. Попробуйте снова.";
  }

  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("auth session missing") ||
    normalizedMessage.includes("session not found") ||
    normalizedMessage.includes("invalid claim") ||
    normalizedMessage.includes("jwt")
  ) {
    return "Ссылка для сброса пароля недействительна или устарела. Запросите новую.";
  }

  return "Не удалось обновить пароль. Попробуйте снова.";
}

export async function resetPasswordAction(
  newPassword: string,
): Promise<ResetPasswordActionResult> {
  const validationError = validatePassword(newPassword);

  if (validationError) {
    return {
      success: false,
      error: validationError,
      debugReason: "validation_failed",
      debugDetails: [],
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      const normalizedMessage = error.message?.toLowerCase() ?? "";
      const debugReason =
        normalizedMessage.includes("auth session missing") ||
        normalizedMessage.includes("session not found") ||
        normalizedMessage.includes("invalid claim") ||
        normalizedMessage.includes("jwt")
          ? "update_user_session_missing"
          : normalizedMessage.includes("password")
            ? "update_user_password_rejected"
            : "update_user_failed";

      return {
        success: false,
        error: mapResetPasswordError(error.message),
        debugReason,
        debugDetails: [
          `error.message=${error.message ?? "none"}`,
          `error.status=${"status" in error ? String(error.status ?? "none") : "none"}`,
          `error.code=${"code" in error ? String(error.code ?? "none") : "none"}`,
        ],
      };
    }

    redirect("/login");
  } catch (error) {
    console.error("Reset password action failed", {
      error:
        error instanceof Error
          ? {
              message: error.message,
              name: error.name,
            }
          : "Unknown error",
    });

    return createErrorResult("Не удалось обновить пароль. Попробуйте позже.");
  }
}

export async function submitResetPasswordFormAction(
  _previousState: ResetPasswordFormState,
  formData: FormData,
): Promise<ResetPasswordFormState> {
  const newPassword = formData.get("newPassword");
  const result = await resetPasswordAction(
    typeof newPassword === "string" ? newPassword : "",
  );

  return {
    error: result.error,
    debugReason: result.debugReason,
    debugDetails: result.debugDetails,
  };
}
