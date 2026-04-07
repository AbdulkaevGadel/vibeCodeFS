"use client";

import { useActionState } from "react";
import {
  submitForgotPasswordFormAction,
  type ForgotPasswordFormState,
} from "./actions";
import { AuthAlert } from "@/app/auth/_components/auth-alert";
import { AuthInputField } from "@/app/auth/_components/auth-input-field";
import { AuthSecondaryLink } from "@/app/auth/_components/auth-secondary-link";
import { AuthSubmitButton } from "@/app/auth/_components/auth-submit-button";

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
