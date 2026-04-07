import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "./forgot-password-form";
import { AuthShell } from "@/app/auth/_components/auth-shell";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    redirect("/");
  }

  return (
    <AuthShell
      title="Восстановление пароля"
      description="Введите email, и мы отправим письмо со ссылкой для сброса пароля."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
