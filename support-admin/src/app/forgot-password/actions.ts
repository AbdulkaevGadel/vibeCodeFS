"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getAbsoluteUrl } from "@/lib/site-url";

export type ForgotPasswordActionResult = {
  success: boolean;
  message: string | null;
  error: string | null;
};

export type ForgotPasswordFormState = {
  message: string | null;
  error: string | null;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const successMessage =
  "Если аккаунт с таким email существует, мы отправили письмо для сброса пароля.";
const forgotPasswordFallbackMessage =
  "Не удалось отправить письмо для восстановления. Попробуйте позже.";
const forgotPasswordRateLimitMessage =
  "Слишком много запросов на восстановление пароля. Попробуйте позже.";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function createErrorResult(error: string): ForgotPasswordActionResult {
  return {
    success: false,
    message: null,
    error,
  };
}

function validateEmail(rawEmail: string) {
  const normalizedEmail = normalizeEmail(rawEmail);

  if (!normalizedEmail) {
    return "Введите email.";
  }

  if (!emailPattern.test(normalizedEmail)) {
    return "Введите корректный email.";
  }

  return null;
}

function isRateLimitError(error: { message?: string; status?: number; code?: string }) {
  const normalizedMessage = error.message?.toLowerCase() ?? "";
  const normalizedCode = error.code?.toLowerCase() ?? "";

  return (
    error.status === 429 ||
    normalizedCode.includes("over_email_send_rate_limit") ||
    normalizedCode.includes("too_many_requests") ||
    normalizedMessage.includes("too many requests") ||
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("over_email_send_rate_limit")
  );
}

function mapForgotPasswordError(error: {
  message?: string;
  status?: number;
  code?: string;
}) {
  if (isRateLimitError(error)) {
    return forgotPasswordRateLimitMessage;
  }

  return forgotPasswordFallbackMessage;
}

export async function forgotPasswordAction(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const validationError = validateEmail(email);

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
      message: successMessage,
      error: null,
    };
  } catch (error) {
    console.error("Forgot password action failed", {
      error:
        error instanceof Error
          ? {
              message: error.message,
              name: error.name,
            }
          : "Unknown error",
    });

    return createErrorResult(
      mapForgotPasswordError(
        error instanceof Error ? { message: error.message } : {},
      ),
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
