import type { InputHTMLAttributes, ReactNode } from "react";

type AuthInputFieldProps = {
  label: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>;

export function AuthInputField({ label, className, ...inputProps }: AuthInputFieldProps) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
      {label}
      <input
        {...inputProps}
        className={`rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900 ${className ?? ""}`.trim()}
      />
    </label>
  );
}
