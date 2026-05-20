import { Button } from "@/shared/ui/button";
import { getManagerFullName, type Manager } from "@/entities/manager";

const transferMenuClassName =
  "absolute right-0 top-full z-10 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-black/5";
const transferMenuTitleClassName =
  "mb-2 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400";
const transferMenuListClassName = "max-h-48 overflow-y-auto";
const transferManagerRoleClassName = "ml-1 text-[10px] text-slate-400";

type TransferMenuProps = {
  allManagers: Manager[];
  isPending: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onTransfer: (targetManagerId: string) => void;
};

export function TransferMenu({ allManagers, isPending, isOpen, onToggle, onTransfer }: TransferMenuProps) {
  return (
    <div className="relative">
      <Button onClick={onToggle} isLoading={isPending} variant="secondary">
        Передать
      </Button>

      {isOpen ? (
        <div className={transferMenuClassName}>
          <p className={transferMenuTitleClassName}>Выберите менеджера</p>
          <div className={transferMenuListClassName}>
            {allManagers.map((manager) => (
              <Button
                key={manager.id}
                onClick={() => onTransfer(manager.id)}
                variant="ghost"
                className="w-full justify-start rounded-lg px-3 py-2 text-left"
                size="sm"
              >
                {getManagerFullName(manager)}{" "}
                <span className={transferManagerRoleClassName}>({manager.role})</span>
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
