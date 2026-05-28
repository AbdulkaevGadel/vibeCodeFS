"use client";

import { useActionState } from "react";
import { submitLoginFormAction } from "./actions";
import type { LoginFormState } from "../model";
import {
  AuthAlert,
  AuthInputField,
  AuthSecondaryLink,
  AuthSubmitButton,
} from "../ui";

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
