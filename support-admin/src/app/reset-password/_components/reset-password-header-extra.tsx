import { isDebugEnabled } from "@/shared/config/debug";
import { DebugPanel } from "@/shared/ui/debug-panel";
import { AuthAlert } from "@/app/auth/_components/auth-alert";

type ResetPasswordHeaderExtraProps = {
  hasRecoveryError: boolean;
  debugItems: string[];
};

export function ResetPasswordHeaderExtra({
  hasRecoveryError,
  debugItems,
}: ResetPasswordHeaderExtraProps) {
  return (
    <>
      {hasRecoveryError ? (
        <AuthAlert variant="danger">
          Ссылка для сброса пароля недействительна или устарела. Запросите
          новую.
        </AuthAlert>
      ) : null}

      {isDebugEnabled ? (
        <DebugPanel title="Recovery Debug" items={debugItems} />
      ) : null}
    </>
  );
}
