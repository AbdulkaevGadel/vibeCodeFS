"use client";

type ConfirmSubmitButtonProps = {
  children: React.ReactNode;
  className: string;
  message: string;
  disabled?: boolean;
  onConfirm?: () => void | Promise<void>;
};

export function ConfirmSubmitButton({
  children,
  className,
  message,
  disabled,
  onConfirm,
}: ConfirmSubmitButtonProps) {
  const buttonClassName = `support-interactive ${className}`;

  return (
    <button
      type={onConfirm ? "button" : "submit"}
      className={buttonClassName}
      disabled={disabled}
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
          return;
        }

        onConfirm?.();
      }}
    >
      {children}
    </button>
  );
}
