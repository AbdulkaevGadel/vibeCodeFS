import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { LoginTestAccount } from "./login-test-account";
import { AuthShell } from "@/app/auth/_components/auth-shell";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    redirect("/");
  }

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
