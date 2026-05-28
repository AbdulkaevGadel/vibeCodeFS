import { AuthAlert } from "../ui";

type ResetPasswordHeaderExtraProps = {
  hasRecoveryError: boolean;
};

export function ResetPasswordHeaderExtra({
  hasRecoveryError,
}: ResetPasswordHeaderExtraProps) {
  return (
    <>
      {hasRecoveryError ? (
        <AuthAlert variant="danger">
          Ссылка для сброса пароля недействительна или устарела. Запросите
          новую.
        </AuthAlert>
      ) : null}
    </>
  );
}
