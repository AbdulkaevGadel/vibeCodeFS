"use client";

import { useActionState } from "react";
import {
  submitForgotPasswordFormAction,
} from "./actions";
import type { ForgotPasswordFormState } from "../model";
import {
  AuthAlert,
  AuthInputField,
  AuthSecondaryLink,
  AuthSubmitButton,
} from "../ui";

const initialState: ForgotPasswordFormState = {
  message: null,
  error: null,
};

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    submitForgotPasswordFormAction,
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

      {state.message ? (
        <AuthAlert variant="success">{state.message}</AuthAlert>
      ) : null}

      {state.error ? (
        <AuthAlert variant="danger">{state.error}</AuthAlert>
      ) : null}

      <AuthSubmitButton disabled={isPending}>
        {isPending ? "Отправляем..." : "Отправить письмо"}
      </AuthSubmitButton>

      <AuthSecondaryLink href="/login">
        Вернуться ко входу
      </AuthSecondaryLink>
    </form>
  );
}
