import { getResetPasswordPageData } from "./_lib/get-reset-password-page-data";
import { getAuthPageUser } from "@/app/auth/_lib/get-auth-page-user";
import { ResetPasswordForm, ResetPasswordHeaderExtra } from "@/features/auth";
import { AuthShell } from "@/widgets/auth-shell";

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
  const { user } = await getAuthPageUser();
  const pageData = getResetPasswordPageData(params, user);

  return (
    <AuthShell
      title="Новый пароль"
      description="Установите новый пароль для входа в админку."
      headerExtra={
        <ResetPasswordHeaderExtra
          hasRecoveryError={pageData.hasRecoveryError}
        />
      }
    >
      <ResetPasswordForm hasUserSession={pageData.hasUserSession} />
    </AuthShell>
  );
}
