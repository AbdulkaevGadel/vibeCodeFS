"use client";

import { useActionState } from "react";
import {
  submitResetPasswordFormAction,
} from "./actions";
import type { ResetPasswordFormState } from "../model";
import {
  AuthAlert,
  AuthInputField,
  AuthSecondaryLink,
  AuthSubmitButton,
} from "../ui";

const initialState: ResetPasswordFormState = {
  error: null,
};

type ResetPasswordFormProps = {
  hasUserSession: boolean;
};

export function ResetPasswordForm({ hasUserSession }: ResetPasswordFormProps) {
  const [state, formAction, isPending] = useActionState(
    submitResetPasswordFormAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {!hasUserSession ? (
        <AuthAlert variant="warning">
          Если ссылка открылась только что, но пароль не обновляется, запросите
          новое письмо для восстановления.
        </AuthAlert>
      ) : null}

      <AuthInputField
        label="Новый пароль"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        autoFocus
      />

      {state.error ? (
        <AuthAlert variant="danger">{state.error}</AuthAlert>
      ) : null}

      <AuthSubmitButton disabled={isPending}>
        {isPending ? "Сохраняем..." : "Сохранить новый пароль"}
      </AuthSubmitButton>

      <AuthSecondaryLink href="/login">
        Вернуться ко входу
      </AuthSecondaryLink>
    </form>
  );
}
