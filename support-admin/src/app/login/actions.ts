"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export type LoginActionInput = {
  email: string;
  password: string;
};

export type LoginActionResult = {
  success: boolean;
  error: string | null;
};

export type LoginFormState = {
  error: string | null;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createErrorResult(error: string): LoginActionResult {
  return {
    success: false,
    error,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function validateLoginInput(rawEmail: string, password: string): string | null {
  const normalizedEmail = normalizeEmail(rawEmail);

  if (!normalizedEmail) {
    return "Введите email.";
  }

  if (!emailPattern.test(normalizedEmail)) {
    return "Введите корректный email.";
  }

  if (!password.trim()) {
    return "Введите пароль.";
  }

  return null;
}

function mapLoginError(message?: string) {
  if (!message) {
    return "Не удалось выполнить вход. Попробуйте позже.";
  }

  if (message === "Invalid login credentials") {
    return "Неверный email или пароль.";
  }

  return "Не удалось выполнить вход. Попробуйте позже.";
}

export async function loginAction({
  email,
  password,
}: LoginActionInput): Promise<LoginActionResult> {
  const normalizedEmail = normalizeEmail(email);
  const validationError = validateLoginInput(email, password);

  if (validationError) {
    return createErrorResult(validationError);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const signInResult = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (signInResult.error) {
      return createErrorResult(mapLoginError(signInResult.error.message));
    }

    if (!signInResult.data.user) {
      return createErrorResult("Не удалось завершить вход. Попробуйте снова.");
    }

    return {
      success: true,
      error: null,
    };
  } catch (error) {
    console.error("Login action failed", {
      error:
        error instanceof Error
          ? {
              message: error.message,
              name: error.name,
            }
          : "Unknown error",
    });

    return createErrorResult("Не удалось выполнить вход. Попробуйте позже.");
  }
}

export async function submitLoginFormAction(
  _previousState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const result = await loginAction({
    email: typeof email === "string" ? email : "",
    password: typeof password === "string" ? password : "",
  });

  if (result.success) {
    redirect("/");
  }

  return {
    error: result.error,
  };
}
