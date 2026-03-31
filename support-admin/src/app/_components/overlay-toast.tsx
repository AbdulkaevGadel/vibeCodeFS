"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const overlayClassName = "fixed bottom-6 right-6 z-50 w-[min(420px,calc(100vw-2rem))]";
const containerBaseClassName =
  "rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-sm";
const successClassName = "support-alert-success";
const errorClassName = "support-alert-danger";
const contentClassName = "flex items-start gap-3";
const bodyClassName = "min-w-0 flex-1";
const titleClassName = "text-xs uppercase tracking-[0.24em] opacity-70";
const messageClassName = "mt-1 text-sm font-medium";
const closeButtonBaseClassName =
  "rounded-full px-2 py-1 text-xs font-semibold transition hover:bg-black/5";
const closeButtonSuccessClassName = "text-emerald-800";
const closeButtonErrorClassName = "text-red-800";

type OverlayToastProps = {
  message: string;
  variant: "success" | "error";
  onClose?: () => void;
  durationMs?: number;
};

export function OverlayToast({
  message,
  variant,
  onClose,
  durationMs = 3000,
}: OverlayToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    setIsMounted(true);

    const timeoutId = window.setTimeout(() => {
      setIsClosing(true);
    }, durationMs);

    return () => {
      setIsMounted(false);
      window.clearTimeout(timeoutId);
    };
  }, [durationMs]);

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

  if (!isVisible) {
    return null;
  }

  if (!isMounted) {
    return null;
  }

  const containerClassName = `${containerBaseClassName} ${
    variant === "success" ? successClassName : errorClassName
  } ${isClosing ? "support-toast-exit" : "support-toast-enter"}`;
  const closeButtonClassName = `${closeButtonBaseClassName} ${
    variant === "success" ? closeButtonSuccessClassName : closeButtonErrorClassName
  }`;

  return createPortal(
    <div className={overlayClassName}>
      <div className={containerClassName} role="status" aria-live="polite">
        <div className={contentClassName}>
          <div className={bodyClassName}>
            <p className={titleClassName}>{variant === "success" ? "Успешно" : "Ошибка"}</p>
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
