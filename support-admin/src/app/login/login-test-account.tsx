export function LoginTestAccount() {
  return (
    <aside className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Тестовый аккаунт
      </p>
      <div className="mt-3 space-y-2 text-sm text-slate-700">
        <p>
          <span className="font-medium text-slate-950">Email:</span> test@test.com
        </p>
        <p>
          <span className="font-medium text-slate-950">Пароль:</span> Qwerty!
        </p>
      </div>
    </aside>
  );
}
