import { getManagerFullName, type Manager } from "@/entities/manager";
import { Button } from "@/shared/ui/button";

type ManagersTableProps = {
  managers: Manager[];
  onEdit: (manager: Manager) => void;
};

const sectionClassName = "rounded-lg border border-slate-200 bg-white p-4 shadow-sm";
const sectionTitleClassName = "text-sm font-bold uppercase tracking-[0.18em] text-slate-500";
const tableWrapperClassName = "mt-4 overflow-x-auto";
const tableClassName = "w-full border-collapse";
const tableHeaderClassName = "text-left text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400";
const tableCellClassName = "border-t border-slate-100 py-3 pr-3 text-sm text-slate-700";

export function ManagersTable({ managers, onEdit }: ManagersTableProps) {
  return (
    <section className={sectionClassName}>
      <h2 className={sectionTitleClassName}>Текущие менеджеры</h2>
      <div className={tableWrapperClassName}>
        <table className={tableClassName}>
          <thead>
            <tr>
              <th className={tableHeaderClassName}>Имя</th>
              <th className={tableHeaderClassName}>Email</th>
              <th className={tableHeaderClassName}>Роль</th>
              <th className={tableHeaderClassName}>Действие</th>
            </tr>
          </thead>
          <tbody>
            {managers.map((manager) => (
              <tr key={manager.id}>
                <td className={tableCellClassName}>{getManagerFullName(manager)}</td>
                <td className={tableCellClassName}>{manager.email ?? "-"}</td>
                <td className={tableCellClassName}>{manager.role}</td>
                <td className={tableCellClassName}>
                  <Button variant="secondary" size="sm" onClick={() => onEdit(manager)}>
                    Редактировать
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
