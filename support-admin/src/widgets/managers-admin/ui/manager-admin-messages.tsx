import { Toast } from "@/shared/ui/toast";

type ManagerAdminMessagesProps = {
  toast: {
    id: number;
    message: string;
    variant: "success" | "error";
  } | null;
  onCloseToast: (id: number) => void;
};

export function ManagerAdminMessages({
  toast,
  onCloseToast,
}: ManagerAdminMessagesProps) {
  if (!toast) {
    return null;
  }

  return (
    <Toast
      key={toast.id}
      message={toast.message}
      variant={toast.variant}
      onClose={() => onCloseToast(toast.id)}
    />
  );
}
