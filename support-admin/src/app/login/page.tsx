import { redirectAuthenticatedUser } from "@/app/auth/_lib/redirect-authenticated-user";
import { LoginForm, LoginTestAccount } from "@/features/auth";
import { AuthShell } from "@/widgets/auth-shell";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  await redirectAuthenticatedUser();

  return (
    <AuthShell
      title="Вход в админку"
      description="Используйте email и пароль администратора, чтобы открыть панель."
      footer={<LoginTestAccount />}
    >
      <LoginForm />
    </AuthShell>
  );
}
