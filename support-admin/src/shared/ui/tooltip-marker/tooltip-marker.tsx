import { ReactNode } from "react";

type TooltipMarkerTone = "neutral" | "muted" | "success" | "warning" | "danger" | "info";
type TooltipMarkerSize = "sm" | "md";

type TooltipMarkerProps = {
  content: string;
  label?: ReactNode;
  ariaLabel?: string;
  tone?: TooltipMarkerTone;
  size?: TooltipMarkerSize;
  className?: string;
  labelClassName?: string;
};

const wrapperClassName = "group relative inline-flex shrink-0";
const markerBaseClassName =
  "support-interactive inline-flex shrink-0 items-center justify-center rounded-full border font-black outline-none transition focus-visible:ring-2 focus-visible:ring-slate-900/20";
const tooltipClassName =
  "pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-max max-w-xs -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium normal-case leading-snug tracking-normal text-slate-700 opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100";

const toneClassNames: Record<TooltipMarkerTone, string> = {
  neutral: "border-slate-200 bg-white text-slate-500",
  muted: "border-slate-200 bg-slate-50 text-slate-400",
  success: "border-emerald-200 bg-emerald-50 text-emerald-600",
  warning: "border-amber-200 bg-amber-50 text-amber-600",
  danger: "border-red-200 bg-red-50 text-red-600",
  info: "border-sky-200 bg-sky-50 text-sky-600",
};

const sizeClassNames: Record<TooltipMarkerSize, string> = {
  sm: "h-5 w-5 text-[11px]",
  md: "h-8 w-8 text-sm",
};

export function TooltipMarker({
  content,
  label = "?",
  ariaLabel,
  tone = "neutral",
  size = "sm",
  className = "",
  labelClassName = "",
}: TooltipMarkerProps) {
  return (
    <span className={wrapperClassName}>
      <button
        type="button"
        className={`${markerBaseClassName} ${toneClassNames[tone]} ${sizeClassNames[size]} ${className}`}
        aria-label={ariaLabel ?? content}
      >
        <span className={labelClassName}>{label}</span>
      </button>
      <span role="tooltip" className={tooltipClassName}>
        {content}
      </span>
    </span>
  );
}
