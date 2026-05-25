import type { ManagerAccountRecovery } from "@/features/manage-managers/model";
import { Button } from "@/shared/ui/button";

type ManagerRecoveryPanelProps = {
  recovery: ManagerAccountRecovery | null;
  isPending: boolean;
  onDelete: () => void;
};

const sectionClassName = "rounded-lg border border-red-200 bg-red-50 p-4";
const titleClassName = "text-sm font-bold uppercase tracking-[0.18em] text-red-700";
const textClassName = "mt-2 text-sm leading-6 text-red-700";
const actionsClassName = "mt-4";
const codeClassName = "rounded bg-white/70 px-1.5 py-0.5 font-mono text-xs";

export function ManagerRecoveryPanel({
  recovery,
  isPending,
  onDelete,
}: ManagerRecoveryPanelProps) {
  if (!recovery) {
    return null;
  }

  return (
    <section className={sectionClassName}>
      <h2 className={titleClassName}>Recovery cleanup</h2>
      <p className={textClassName}>
        Auth user для <span className={codeClassName}>{recovery.email}</span> создан,
        но строка <span className={codeClassName}>managers</span> не создана. Удаление
        разрешено только после server-side проверки, что Auth user не связан с менеджером.
      </p>
      <div className={actionsClassName}>
        <Button type="button" variant="danger" isLoading={isPending} onClick={onDelete}>
          Удалить незавершённый Auth account
        </Button>
      </div>
    </section>
  );
}
