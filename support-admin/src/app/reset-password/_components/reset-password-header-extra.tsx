import { isDebugEnabled } from "@/shared/config/debug";
import { DebugPanel } from "@/shared/ui/debug-panel";

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
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Ссылка для сброса пароля недействительна или устарела. Запросите
          новую.
        </p>
      ) : null}

      {isDebugEnabled ? (
        <DebugPanel title="Recovery Debug" items={debugItems} />
      ) : null}
    </>
  );
}
