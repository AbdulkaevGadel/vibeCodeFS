import Link from "next/link";
import type { ReactNode } from "react";

type AuthSecondaryLinkProps = {
  href: string;
  children: ReactNode;
  align?: "center" | "compact";
};

const alignClasses = {
  center: "text-center",
  compact: "w-fit self-center",
};

export function AuthSecondaryLink({
  href,
  children,
  align = "compact",
}: AuthSecondaryLinkProps) {
  return (
    <Link
      href={href}
      className={`${alignClasses[align]} text-sm text-slate-600 underline underline-offset-4 transition hover:text-slate-900`}
    >
      {children}
    </Link>
  );
}
