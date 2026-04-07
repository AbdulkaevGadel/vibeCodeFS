import { LoginForm } from "./login-form";
import { LoginTestAccount } from "./login-test-account";
import { AuthShell } from "@/app/auth/_components/auth-shell";
import { redirectAuthenticatedUser } from "@/app/auth/_lib/redirect-authenticated-user";

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
