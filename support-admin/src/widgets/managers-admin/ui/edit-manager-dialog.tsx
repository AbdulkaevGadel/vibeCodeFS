import { FormEvent } from "react";
import { type Manager } from "@/entities/manager";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";

type EditManagerDialogProps = {
  manager: Manager | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const formGridClassName = "grid gap-3 md:grid-cols-2";
const inputClassName =
  "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900";
const selectClassName =
  "support-interactive mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900";
const labelClassName = "text-sm font-medium text-slate-700";
const actionsClassName = "flex items-end gap-3";

export function EditManagerDialog({
  manager,
  isPending,
  onClose,
  onSubmit,
}: EditManagerDialogProps) {
  return (
    <Modal
      isOpen={Boolean(manager)}
      title="Редактировать менеджера"
      description="Display name, фамилия и role обновляются в managers."
      onClose={onClose}
      size="md"
      disableClose={isPending}
    >
      {manager ? (
        <form key={manager.id} className={formGridClassName} onSubmit={onSubmit}>
          <label className={labelClassName}>
            Display name
            <input
              name="displayName"
              required
              defaultValue={manager.displayName}
              className={inputClassName}
            />
          </label>
          <label className={labelClassName}>
            Фамилия
            <input
              name="lastName"
              defaultValue={manager.lastName ?? ""}
              className={inputClassName}
            />
          </label>
          <label className={labelClassName}>
            Роль
            <select name="role" required defaultValue={manager.role} className={selectClassName}>
              <option value="support">support</option>
              <option value="supervisor">supervisor</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <div className={actionsClassName}>
            <Button type="submit" isLoading={isPending} variant="primary">
              Сохранить
            </Button>
            <Button type="button" isLoading={isPending} variant="ghost" onClick={onClose}>
              Отмена
            </Button>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}
