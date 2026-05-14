import { ReactNode } from "react";

type BadgeVariant =
  | "default"
  | "muted"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "inverse";

type BadgeSize = "sm" | "md" | "icon";

type BadgeProps = {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  title?: string;
  className?: string;
};

const baseClassName = "inline-flex shrink-0 items-center justify-center gap-1.5 font-bold";

const variantClassNames: Record<BadgeVariant, string> = {
  default: "support-chip text-slate-700 ring-1 ring-slate-200",
  muted: "support-surface-muted support-text-secondary",
  accent: "bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-500/20",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  danger: "bg-red-100 text-red-700",
  info: "bg-blue-500 text-white shadow-sm ring-1 ring-white/10",
  inverse: "bg-white/12 text-white",
};

const sizeClassNames: Record<BadgeSize, string> = {
  sm: "rounded-full px-2 py-0.5 text-[10px] uppercase",
  md: "rounded-full px-3 py-1 text-xs",
  icon: "h-5 w-5 rounded-full text-[10px]",
};

export function Badge({
  children,
  variant = "default",
  size = "md",
  title,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`${baseClassName} ${variantClassNames[variant]} ${sizeClassNames[size]} ${className}`}
      title={title}
    >
      {children}
    </span>
  );
}
