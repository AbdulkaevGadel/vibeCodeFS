import { getManagerDisplayLabel, type Manager } from "@/entities/manager";

const currentManagerPanelClassName = "support-surface-default rounded-2xl px-4 py-3";
const statLabelClassName = "support-text-muted text-xs uppercase tracking-[0.24em]";
const currentManagerNameClassName = "support-text-primary mt-2 truncate text-lg font-semibold";

type CurrentManagerPanelProps = {
  manager: Manager;
};

export function CurrentManagerPanel({ manager }: CurrentManagerPanelProps) {
  const label = getManagerDisplayLabel(manager);

  return (
    <div className={currentManagerPanelClassName}>
      <p className={statLabelClassName}>Вы вошли как</p>
      <p className={currentManagerNameClassName} title={`${label} (${manager.role})`}>
        {label} ({manager.role})
      </p>
    </div>
  );
}
