"use client";

import { Toast } from "@/shared/ui/toast";

type ErrorAlertProps = {
  message: string;
};

export function ErrorAlert({ message }: ErrorAlertProps) {
  return <Toast message={message} variant="error" />;
}
