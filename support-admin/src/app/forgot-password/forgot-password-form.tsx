"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  submitForgotPasswordFormAction,
  type ForgotPasswordFormState,
} from "./actions";

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
      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
        />
      </label>

      {state.message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.message}
        </p>
      ) : null}

      {state.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
      >
        {isPending ? "Отправляем..." : "Отправить письмо"}
      </button>

      <Link
        href="/login"
        className="w-fit self-center text-sm text-slate-600 underline underline-offset-4 transition hover:text-slate-900"
      >
        Вернуться ко входу
      </Link>
    </form>
  );
}
