"use client";

import { useEffect } from "react";
import { OverlayToast } from "./overlay-toast";

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

  return <OverlayToast message={message} variant={variant} />;
}
