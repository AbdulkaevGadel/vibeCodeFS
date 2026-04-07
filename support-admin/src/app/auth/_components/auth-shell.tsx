import type { ReactNode } from "react";

type AuthShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  headerExtra?: ReactNode;
};

export function AuthShell({
  title,
  description,
  children,
  footer,
  headerExtra,
}: AuthShellProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="space-y-6">
          <header className="space-y-2">
            <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
            {description ? (
              <p className="text-sm text-slate-600">{description}</p>
            ) : null}
          </header>

          {headerExtra}

          {children}

          {footer}
        </div>
      </section>
    </main>
  );
}
