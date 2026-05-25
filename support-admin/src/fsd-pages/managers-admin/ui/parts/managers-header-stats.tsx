type ManagersHeaderStatsProps = {
  adminCount: number;
  supervisorCount: number;
  supportCount: number;
};

const statsGridClassName = "grid gap-3 sm:grid-cols-3";
const statCardClassName = "rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm";
const statLabelClassName = "text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400";
const statValueClassName = "mt-1 text-2xl font-semibold text-slate-950";

export function ManagersHeaderStats({
  adminCount,
  supervisorCount,
  supportCount,
}: ManagersHeaderStatsProps) {
  return (
    <div className={statsGridClassName}>
      <div className={statCardClassName}>
        <p className={statLabelClassName}>Admin</p>
        <p className={statValueClassName}>{adminCount}</p>
      </div>
      <div className={statCardClassName}>
        <p className={statLabelClassName}>Supervisor</p>
        <p className={statValueClassName}>{supervisorCount}</p>
      </div>
      <div className={statCardClassName}>
        <p className={statLabelClassName}>Support</p>
        <p className={statValueClassName}>{supportCount}</p>
      </div>
    </div>
  );
}
