type ErrorAlertProps = {
  message: string;
};

const errorAlertClassName =
  "support-alert-danger mt-4 rounded-2xl p-4 text-sm";

export function ErrorAlert({ message }: ErrorAlertProps) {
  return <div className={errorAlertClassName}>{message}</div>;
}
