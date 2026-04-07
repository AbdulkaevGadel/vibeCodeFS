import { ResetPasswordForm } from "./reset-password-form";
import { ResetPasswordHeaderExtra } from "./_components/reset-password-header-extra";
import { getResetPasswordPageData } from "./_lib/get-reset-password-page-data";
import { AuthShell } from "@/app/auth/_components/auth-shell";
import { getAuthPageUser } from "@/app/auth/_lib/get-auth-page-user";

export const dynamic = "force-dynamic";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    error?: string | string[];
  }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams;
  const { user, error } = await getAuthPageUser();
  const pageData = getResetPasswordPageData(params, user, error);

  return (
    <AuthShell
      title="Новый пароль"
      description="Установите новый пароль для входа в админку."
      headerExtra={
        <ResetPasswordHeaderExtra
          hasRecoveryError={pageData.hasRecoveryError}
          debugItems={pageData.debugItems}
        />
      }
    >
      <ResetPasswordForm hasUserSession={pageData.hasUserSession} />
    </AuthShell>
  );
}
