import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "./forgot-password-form";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="mb-6 space-y-2">
          <h1 className="text-2xl font-semibold text-slate-950">
            Восстановление пароля
          </h1>
          <p className="text-sm text-slate-600">
            Введите email, и мы отправим письмо со ссылкой для сброса пароля.
          </p>
        </div>

        <ForgotPasswordForm />
      </section>
    </main>
  );
}
