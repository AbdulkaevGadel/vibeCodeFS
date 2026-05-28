"use client";

import type { ReactNode } from "react";
import { Toast } from "@/shared/ui/toast";

type AuthAlertVariant = "danger" | "success" | "warning";

type AuthAlertProps = {
  children: ReactNode;
  variant: AuthAlertVariant;
};

const toastVariant: Record<AuthAlertVariant, "error" | "success" | "warning"> = {
  danger: "error",
  success: "success",
  warning: "warning",
};

export function AuthAlert({ children, variant }: AuthAlertProps) {
  return <Toast message={children} variant={toastVariant[variant]} />;
}
