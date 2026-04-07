type LoadingScreenProps = {
  title?: string;
  description?: string;
  fullscreen?: boolean;
};

export function LoadingScreen({
  title = "Загрузка",
  description = "Подождите немного, данные обновляются.",
  fullscreen = true,
}: LoadingScreenProps) {
  return (
    <main
      className={
        fullscreen
          ? "flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12"
          : "flex items-center justify-center px-4 py-12"
      }
    >
      <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
          <p className="text-sm text-slate-600">{description}</p>
        </div>
      </section>
    </main>
  );
}
