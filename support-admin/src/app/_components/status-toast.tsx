"use client";

import { useEffect } from "react";
import { Toast } from "@/shared/ui/toast";

type StatusToastProps = {
  message: string;
  variant: "success" | "error";
};

export function StatusToast({ message, variant }: StatusToastProps) {
  useEffect(() => {
    void fetch("/api/flash", {
      method: "DELETE",
      cache: "no-store",
    });
  }, []);

  return <Toast message={message} variant={variant} />;
}
