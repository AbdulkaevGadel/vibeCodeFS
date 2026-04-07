"use client";

import { useActionState } from "react";
import { submitLoginFormAction, type LoginFormState } from "./actions";
import { AuthAlert } from "@/app/auth/_components/auth-alert";
import { AuthInputField } from "@/app/auth/_components/auth-input-field";
import { AuthSecondaryLink } from "@/app/auth/_components/auth-secondary-link";
import { AuthSubmitButton } from "@/app/auth/_components/auth-submit-button";

const initialState: LoginFormState = {
  error: null,
};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    submitLoginFormAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <AuthInputField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        autoFocus
      />

      <AuthInputField
        label="Пароль"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />

      {state.error ? (
        <AuthAlert variant="danger">{state.error}</AuthAlert>
      ) : null}

      <AuthSubmitButton disabled={isPending}>
        {isPending ? "Входим..." : "Войти"}
      </AuthSubmitButton>

      <AuthSecondaryLink href="/forgot-password" align="center">
        Забыли пароль?
      </AuthSecondaryLink>
    </form>
  );
}
