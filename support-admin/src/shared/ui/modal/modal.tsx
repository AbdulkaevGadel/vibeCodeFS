"use client";

import { ReactNode, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

type ModalSize = "sm" | "md" | "lg" | "xl";

type ModalProps = {
  isOpen: boolean;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  size?: ModalSize;
  disableClose?: boolean;
  className?: string;
  bodyClassName?: string;
  overlayClassName?: string;
};

const overlayBaseClassName =
  "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm";
const panelBaseClassName =
  "relative flex max-h-[min(720px,calc(100vh-2rem))] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl";
const headerClassName = "border-b border-slate-200 bg-white px-6 py-5 pr-16";
const titleClassName = "text-xl font-semibold text-slate-950";
const descriptionClassName = "mt-1 text-sm text-slate-500";
const bodyBaseClassName = "overflow-y-auto px-6 py-5";
const footerClassName = "flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4";
const closeButtonClassName =
  "support-interactive absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-2xl leading-none text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 disabled:opacity-50";

const sizeClassNames: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-5xl",
};

export function Modal({
  isOpen,
  title,
  description,
  children,
  footer,
  onClose,
  closeLabel = "Закрыть",
  size = "md",
  disableClose = false,
  className = "",
  bodyClassName = "",
  overlayClassName = "",
}: ModalProps) {
  const [isMounted, setIsMounted] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    // Preserve portal mounting behavior from the previous Dialog primitive.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || disableClose) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disableClose, isOpen, onClose]);

  if (!isMounted || !isOpen) {
    return null;
  }

  const panelClassName = `${panelBaseClassName} ${sizeClassNames[size]} ${className}`;
  const bodyClassNameCombined = `${bodyBaseClassName} ${bodyClassName}`;
  const overlayClassNameCombined = `${overlayBaseClassName} ${overlayClassName}`;

  return createPortal(
    <div
      className={overlayClassNameCombined}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !disableClose) {
          onClose();
        }
      }}
    >
      <div
        className={panelClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <button
          type="button"
          className={closeButtonClassName}
          aria-label={closeLabel}
          disabled={disableClose}
          onClick={onClose}
        >
          ×
        </button>
        <div className={headerClassName}>
          <h2 id={titleId} className={titleClassName}>
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className={descriptionClassName}>
              {description}
            </p>
          ) : null}
        </div>
        <div className={bodyClassNameCombined}>{children}</div>
        {footer ? <div className={footerClassName}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
