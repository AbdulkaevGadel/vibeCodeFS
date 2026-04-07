import type { ReactNode } from "react";

type AuthSubmitButtonProps = {
  children: ReactNode;
  disabled?: boolean;
};

export function AuthSubmitButton({
  children,
  disabled = false,
}: AuthSubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
    >
      {children}
    </button>
  );
}
