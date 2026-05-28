"use client";

import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ToastVariant = "success" | "error" | "warning";

type ToastProps = {
  message: ReactNode;
  variant: ToastVariant;
  onClose?: () => void;
  durationMs?: number;
};

const overlayClassName = "fixed bottom-6 right-6 z-50 w-[min(420px,calc(100vw-2rem))]";
const containerBaseClassName =
  "rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-sm";
const contentClassName = "flex items-start gap-3";
const bodyClassName = "min-w-0 flex-1";
const titleClassName = "text-xs uppercase tracking-[0.24em] opacity-70";
const messageClassName = "mt-1 text-sm font-medium";
const closeButtonBaseClassName =
  "support-interactive rounded-full px-2 py-1 text-xs font-semibold transition hover:bg-black/5";

const variantConfig: Record<ToastVariant, {
  containerClassName: string;
  closeButtonClassName: string;
  title: string;
  durationMs: number;
}> = {
  success: {
    containerClassName: "support-alert-success",
    closeButtonClassName: "text-emerald-800",
    title: "Успешно",
    durationMs: 4000,
  },
  error: {
    containerClassName: "support-alert-danger",
    closeButtonClassName: "text-red-800",
    title: "Ошибка",
    durationMs: 10000,
  },
  warning: {
    containerClassName: "support-alert-warning",
    closeButtonClassName: "text-amber-800",
    title: "Внимание",
    durationMs: 10000,
  },
};

export function Toast({
  message,
  variant,
  onClose,
  durationMs,
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const config = variantConfig[variant];
  const autoCloseMs = durationMs ?? config.durationMs;

  useEffect(() => {
    // Portal rendering needs a client-only mount pass before document.body is available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);

    const timeoutId = window.setTimeout(() => {
      setIsClosing(true);
    }, autoCloseMs);

    return () => {
      setIsMounted(false);
      window.clearTimeout(timeoutId);
    };
  }, [autoCloseMs]);

  useEffect(() => {
    if (!isClosing) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsVisible(false);
    }, 160);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isClosing]);

  useEffect(() => {
    if (!isVisible) {
      onClose?.();
    }
  }, [isVisible, onClose]);

  if (!isVisible || !isMounted) {
    return null;
  }

  const containerClassName = `${containerBaseClassName} ${config.containerClassName} ${
    isClosing ? "support-toast-exit" : "support-toast-enter"
  }`;
  const closeButtonClassName = `${closeButtonBaseClassName} ${config.closeButtonClassName}`;

  return createPortal(
    <div className={overlayClassName}>
      <div className={containerClassName} role="status" aria-live="polite">
        <div className={contentClassName}>
          <div className={bodyClassName}>
            <p className={titleClassName}>{config.title}</p>
            <p className={messageClassName}>{message}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsClosing(true)}
            className={closeButtonClassName}
            aria-label="Закрыть уведомление"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
