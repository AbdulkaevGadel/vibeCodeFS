import type { ReactNode } from "react";

type AuthAlertVariant = "danger" | "success" | "warning";

type AuthAlertProps = {
  children: ReactNode;
  variant: AuthAlertVariant;
};

const variantClasses: Record<AuthAlertVariant, string> = {
  danger: "border-red-200 bg-red-50 text-red-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
};

export function AuthAlert({ children, variant }: AuthAlertProps) {
  return (
    <p
      className={`rounded-md border px-3 py-2 text-sm ${variantClasses[variant]}`}
    >
      {children}
    </p>
  );
}
