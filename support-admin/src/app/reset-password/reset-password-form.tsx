"use client";

import Link from "next/link";
import {useActionState} from "react";
import {type ResetPasswordFormState, submitResetPasswordFormAction,} from "./actions";

const initialState: ResetPasswordFormState = {
    error: null,
    debugReason: null,
    debugDetails: [],
};

type ResetPasswordFormProps = {
    hasUserSession: boolean;
};

export function ResetPasswordForm({hasUserSession}: ResetPasswordFormProps) {
    const [state, formAction, isPending] = useActionState(
        submitResetPasswordFormAction,
        initialState,
    );

    return (
        <form action={formAction} className="flex flex-col gap-4">
            {!hasUserSession ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Если ссылка открылась только что, но пароль не обновляется, запросите новое
                    письмо для восстановления.
                </p>
            ) : null}

            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Новый пароль
                <input
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    autoFocus
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                />
            </label>

            {state.error ? (
                <div className="space-y-2">
                    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {state.error}
                    </p>
                </div>
            ) : null}

            <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
                {isPending ? "Сохраняем..." : "Сохранить новый пароль"}
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
