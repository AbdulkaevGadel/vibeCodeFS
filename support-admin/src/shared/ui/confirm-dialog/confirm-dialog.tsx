"use client";

import { ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";

type ConfirmDialogVariant = "default" | "danger";

type ConfirmDialogProps = {
  isOpen: boolean;
  title: ReactNode;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const descriptionClassName = "whitespace-pre-wrap text-sm leading-6 text-slate-600";

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  variant = "default",
  isPending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      title={title}
      onClose={onCancel}
      size="sm"
      disableClose={isPending}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isPending}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            isLoading={isPending}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className={descriptionClassName}>{description}</p>
    </Modal>
  );
}
