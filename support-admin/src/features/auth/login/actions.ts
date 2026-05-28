"use server";

import { redirect } from "next/navigation";
import type { LoginFormState } from "../model";
import {
  getLoginLogErrorDetails,
  mapLoginError,
  normalizeLoginEmail,
  validateLoginInput,
} from "./login-action-utils";
import { createSupabaseServerClient } from "@/shared/api/supabase/server-client";

export type LoginActionInput = {
  email: string;
  password: string;
};

export type LoginActionResult = {
  success: boolean;
  error: string | null;
};

function createErrorResult(error: string): LoginActionResult {
  return {
    success: false,
    error,
  };
}

export async function loginAction({
  email,
  password,
}: LoginActionInput): Promise<LoginActionResult> {
  const normalizedEmail = normalizeLoginEmail(email);
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
      error: getLoginLogErrorDetails(error),
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
