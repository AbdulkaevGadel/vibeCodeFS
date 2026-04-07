import { ResetPasswordForm } from "./reset-password-form";
import { AuthShell } from "@/app/auth/_components/auth-shell";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isDebugEnabled } from "@/shared/config/debug";
import { DebugPanel } from "@/shared/ui/debug-panel";

export const dynamic = "force-dynamic";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    error?: string | string[];
  }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  const params = await searchParams;
  const hasRecoveryError =
    (typeof params.error === "string" && params.error.length > 0) ||
    Array.isArray(params.error);
  const debugItems = [
    `session.user=${data.user ? "present" : "missing"}`,
    `session.userId=${data.user?.id ?? "none"}`,
    `auth.errorMessage=${error?.message ?? "none"}`,
    `auth.errorStatus=${
      error && "status" in error ? String(error.status ?? "none") : "none"
    }`,
    `auth.errorCode=${
      error && "code" in error ? String(error.code ?? "none") : "none"
    }`,
    `recovery.errorParam=${hasRecoveryError ? "present" : "none"}`,
  ];
  const headerExtra = (
    <>
      {hasRecoveryError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Ссылка для сброса пароля недействительна или устарела. Запросите
          новую.
        </p>
      ) : null}

      {isDebugEnabled ? (
        <DebugPanel title="Recovery Debug" items={debugItems} />
      ) : null}
    </>
  );

  return (
    <AuthShell
      title="Новый пароль"
      description="Установите новый пароль для входа в админку."
      headerExtra={headerExtra}
    >
      <ResetPasswordForm hasUserSession={Boolean(data.user)} />
    </AuthShell>
  );
}
