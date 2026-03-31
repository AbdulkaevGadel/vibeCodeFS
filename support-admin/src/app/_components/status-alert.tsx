import { StatusToast } from "./status-toast";

type StatusAlertProps = {
  message: string;
  variant: "success" | "error";
};

export function StatusAlert({ message, variant }: StatusAlertProps) {
  return <StatusToast message={message} variant={variant} />;
}
