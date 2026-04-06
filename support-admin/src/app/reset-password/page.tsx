import { ResetPasswordForm } from "./reset-password-form";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    debug?: string | string[];
  }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const params = await searchParams;
  const hasRecoveryError =
    (typeof params.error === "string" && params.error.length > 0) ||
    Array.isArray(params.error);
  const confirmDebug = Array.isArray(params.debug)
    ? params.debug.join(",")
    : params.debug ?? null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="mb-6 space-y-2">
          <h1 className="text-2xl font-semibold text-slate-950">Новый пароль</h1>
          <p className="text-sm text-slate-600">
            Установите новый пароль для входа в админку.
          </p>
        </div>

        {hasRecoveryError ? (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Ссылка для сброса пароля недействительна или устарела. Запросите новую.
          </p>
        ) : null}

        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <p>debug.confirm: {confirmDebug ?? "none"}</p>
          <p>debug.user: {data.user ? "present" : "missing"}</p>
        </div>

        <ResetPasswordForm hasUserSession={Boolean(data.user)} />
      </section>
    </main>
  );
}
