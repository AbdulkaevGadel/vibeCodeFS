"use server";

import { redirect } from "next/navigation";
import type { ResetPasswordFormState } from "../model";
import {
  getResetPasswordLogErrorDetails,
  mapResetPasswordError,
  validateResetPassword,
} from "./reset-password-action-utils";
import { createSupabaseServerClient } from "@/shared/api/supabase/server-client";

export type ResetPasswordActionResult = {
  success: boolean;
  error: string | null;
};

export async function resetPasswordAction(
  newPassword: string,
): Promise<ResetPasswordActionResult> {
  const validationError = validateResetPassword(newPassword);

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
    console.error("Reset password action failed", {
      error: getResetPasswordLogErrorDetails(error),
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
