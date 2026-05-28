"use server";

import type { ForgotPasswordFormState } from "../model";
import {
  forgotPasswordSuccessMessage,
  getForgotPasswordErrorLike,
  getForgotPasswordLogErrorDetails,
  mapForgotPasswordError,
  normalizeForgotPasswordEmail,
  validateForgotPasswordEmail,
} from "./forgot-password-action-utils";
import { createSupabaseServerClient } from "@/shared/api/supabase/server-client";
import { getAbsoluteUrl } from "@/shared/config/site-url";

export type ForgotPasswordActionResult = {
  success: boolean;
  message: string | null;
  error: string | null;
};

function createErrorResult(error: string): ForgotPasswordActionResult {
  return {
    success: false,
    message: null,
    error,
  };
}

export async function forgotPasswordAction(email: string) {
  const normalizedEmail = normalizeForgotPasswordEmail(email);
  const validationError = validateForgotPasswordEmail(email);

  if (validationError) {
    return createErrorResult(validationError);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: getAbsoluteUrl("/auth/confirm?next=/reset-password"),
    });

    if (error) {
      return createErrorResult(mapForgotPasswordError(error));
    }

    return {
      success: true,
      message: forgotPasswordSuccessMessage,
      error: null,
    };
  } catch (error) {
    console.error("Forgot password action failed", {
      error: getForgotPasswordLogErrorDetails(error),
    });

    return createErrorResult(
      mapForgotPasswordError(getForgotPasswordErrorLike(error)),
    );
  }
}

export async function submitForgotPasswordFormAction(
  _previousState: ForgotPasswordFormState,
  formData: FormData,
): Promise<ForgotPasswordFormState> {
  const email = formData.get("email");
  const result = await forgotPasswordAction(typeof email === "string" ? email : "");

  return {
    message: result.message,
    error: result.error,
  };
}
