type LoadingScreenProps = {
  title?: string;
  description?: string;
  fullscreen?: boolean;
};

const fullscreenMainClassName = "flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12";
const inlineMainClassName = "flex items-center justify-center px-4 py-12";
const panelClassName = "w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200";
const spinnerClassName =
  "mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900";
const titleClassName = "text-2xl font-semibold text-slate-950";
const descriptionClassName = "text-sm text-slate-600";

export function LoadingScreen({
  title = "Загрузка",
  description = "Подождите немного, данные обновляются.",
  fullscreen = true,
}: LoadingScreenProps) {
  const mainClassName = fullscreen ? fullscreenMainClassName : inlineMainClassName;

  return (
    <main className={mainClassName}>
      <section className={panelClassName}>
        <div className={spinnerClassName} />
        <div className="space-y-2">
          <h1 className={titleClassName}>{title}</h1>
          <p className={descriptionClassName}>{description}</p>
        </div>
      </section>
    </main>
  );
}
