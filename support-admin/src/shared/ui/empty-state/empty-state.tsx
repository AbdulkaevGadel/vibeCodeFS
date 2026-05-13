import { ReactNode } from "react";

type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

const containerClassName =
  "flex h-full min-h-[260px] flex-col items-center justify-center support-panel p-12 text-center";
const titleClassName = "support-text-primary mb-2 text-xl font-semibold";
const descriptionClassName = "support-text-secondary max-w-xs text-sm";
const actionClassName = "mt-5";

export function EmptyState({
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`${containerClassName} ${className}`}>
      <h3 className={titleClassName}>{title}</h3>
      {description ? <p className={descriptionClassName}>{description}</p> : null}
      {action ? <div className={actionClassName}>{action}</div> : null}
    </div>
  );
}
