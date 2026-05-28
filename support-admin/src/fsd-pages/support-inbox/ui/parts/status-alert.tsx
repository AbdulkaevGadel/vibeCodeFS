"use client";

import { useEffect } from "react";
import { Toast } from "@/shared/ui/toast";

type StatusAlertProps = {
  message: string;
  variant: "success" | "error";
};

export function StatusAlert({ message, variant }: StatusAlertProps) {
  useEffect(() => {
    void fetch("/api/support-admin-flash", {
      method: "DELETE",
      cache: "no-store",
    });
  }, []);

  return <Toast message={message} variant={variant} />;
}
