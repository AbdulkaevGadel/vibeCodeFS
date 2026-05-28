import { redirectAuthenticatedUser } from "@/app/auth/_lib/redirect-authenticated-user";
import { ForgotPasswordForm } from "@/features/auth";
import { AuthShell } from "@/widgets/auth-shell";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  await redirectAuthenticatedUser();

  return (
    <AuthShell
      title="Восстановление пароля"
      description="Введите email, и мы отправим письмо со ссылкой для сброса пароля."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
