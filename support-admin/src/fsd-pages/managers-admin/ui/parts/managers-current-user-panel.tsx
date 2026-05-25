import type { Manager } from "@/entities/manager";

type ManagersCurrentUserPanelProps = {
  manager: Manager;
};

const sidePanelClassName = "rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm";
const sidePanelLabelClassName = "text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400";
const sidePanelTextClassName = "mt-1 text-sm font-medium text-slate-700";

export function ManagersCurrentUserPanel({ manager }: ManagersCurrentUserPanelProps) {
  return (
    <div className={sidePanelClassName}>
      <p className={sidePanelLabelClassName}>Текущий пользователь</p>
      <p className={sidePanelTextClassName}>{manager.displayName}</p>
    </div>
  );
}
