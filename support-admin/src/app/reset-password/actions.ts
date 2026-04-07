"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export type ResetPasswordActionResult = {
  success: boolean;
  error: string | null;
};

export type ResetPasswordFormState = {
  error: string | null;
};

const minimumPasswordLength = 8;

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
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      console.error("Reset password updateUser returned error", {
        message: error.message ?? "none",
        status: "status" in error ? String(error.status ?? "none") : "none",
        code: "code" in error ? String(error.code ?? "none") : "none",
      });

      return {
        success: false,
        error: mapResetPasswordError(error.message),
      };
    }
  } catch (error) {
    const errorDetails =
      error instanceof Error
        ? {
            message: error.message,
            name: error.name,
            stack: error.stack ?? "none",
          }
        : {
            message: String(error),
            name: "Unknown error",
            stack: "none",
          };

    console.error("Reset password action failed", {
      error: errorDetails,
    });

    return {
      success: false,
      error: "Не удалось обновить пароль. Попробуйте позже.",
    };
  }

  redirect("/login");
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
  };
}
