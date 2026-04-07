import { ForgotPasswordForm } from "./forgot-password-form";
import { AuthShell } from "@/app/auth/_components/auth-shell";
import { redirectAuthenticatedUser } from "@/app/auth/_lib/redirect-authenticated-user";

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
