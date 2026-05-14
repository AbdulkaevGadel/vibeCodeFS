"use client";

import { useCallback, useState } from "react";

type ToastState<Variant extends string> = {
  id: number;
  message: string;
  variant: Variant;
};

export function useToastState<Variant extends string>() {
  const [toast, setToast] = useState<ToastState<Variant> | null>(null);

  const showToast = useCallback((message: string, variant: Variant) => {
    setToast({
      id: Date.now(),
      message,
      variant,
    });
  }, []);

  const closeToast = useCallback((id: number) => {
    setToast((current) => current?.id === id ? null : current);
  }, []);

  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  return {
    toast,
    showToast,
    closeToast,
    clearToast,
  };
}
