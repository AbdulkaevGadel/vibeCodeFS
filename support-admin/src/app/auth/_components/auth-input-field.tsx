import type { InputHTMLAttributes, ReactNode } from "react";

type AuthInputFieldProps = {
  label: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>;

const labelClassName = "flex flex-col gap-2 text-sm font-medium text-slate-700";
const inputBaseClassName =
  "rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900";

export function AuthInputField({ label, className, ...inputProps }: AuthInputFieldProps) {
  const inputClassName = `${inputBaseClassName} ${className ?? ""}`.trim();

  return (
    <label className={labelClassName}>
      {label}
      <input
        {...inputProps}
        className={inputClassName}
      />
    </label>
  );
}
