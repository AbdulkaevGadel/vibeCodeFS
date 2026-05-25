"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { isManagerRole, type Manager } from "@/entities/manager";
import type {
  ManagerAccountRecovery,
  ManageManagersActionResult,
} from "@/features/manage-managers/model";
import { useToastState } from "@/shared/ui/toast";
import type { ManagersAdminPanelProps } from "../model";
import { CreateManagerAccountForm } from "./create-manager-account-form";
import { EditManagerDialog } from "./edit-manager-dialog";
import { ManagerAdminMessages } from "./manager-admin-messages";
import { ManagerRecoveryPanel } from "./manager-recovery-panel";
import { ManagersTable } from "./managers-table";

const panelClassName = "mt-6 grid gap-4";

function readManagerRoleFromForm(formData: FormData) {
  const role = formData.get("role")?.toString();
  return isManagerRole(role) ? role : "support";
}

export function ManagersAdminPanel({
  managers,
  actions,
}: ManagersAdminPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingManager, setEditingManager] = useState<Manager | null>(null);
  const [recovery, setRecovery] = useState<ManagerAccountRecovery | null>(null);
  const {
    toast,
    showToast,
    closeToast,
    clearToast,
  } = useToastState<"success" | "error">();

  const runAction = (
    action: () => Promise<ManageManagersActionResult>,
    successMessage: string,
    onSuccess?: () => void,
  ) => {
    clearToast();

    startTransition(async () => {
      const result = await action();

      setRecovery(result.recovery);

      if (!result.success) {
        showToast(result.error ?? "Операция не выполнена.", "error");
        return;
      }

      showToast(successMessage, "success");
      onSuccess?.();
      router.refresh();
    });
  };

  const handleCreateManagerAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    runAction(
      () =>
        actions.createManagerAccount({
          email: formData.get("email")?.toString() ?? "",
          password: formData.get("password")?.toString() ?? "",
          displayName: formData.get("displayName")?.toString() ?? "",
          lastName: formData.get("lastName")?.toString() ?? "",
        }),
      "Менеджер создан с ролью support.",
      () => form.reset(),
    );
  };

  const handleDeleteUnlinkedAuthUser = () => {
    if (!recovery) {
      return;
    }

    runAction(
      () =>
        actions.deleteUnlinkedAuthUser({
          authUserId: recovery.authUserId,
          email: recovery.email,
        }),
      "Незавершённый Auth account удалён.",
      () => setRecovery(null),
    );
  };

  const handleUpdateManager = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingManager) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const role = readManagerRoleFromForm(formData);

    runAction(
      () =>
        actions.updateManager({
          managerId: editingManager.id,
          displayName: formData.get("displayName")?.toString() ?? "",
          lastName: formData.get("lastName")?.toString() ?? "",
          role,
        }),
      "Менеджер обновлён.",
      () => setEditingManager(null),
    );
  };

  return (
    <div className={panelClassName}>
      <ManagerAdminMessages
        toast={toast}
        onCloseToast={closeToast}
      />
      <CreateManagerAccountForm
        isPending={isPending}
        onSubmit={handleCreateManagerAccount}
      />
      <ManagerRecoveryPanel
        recovery={recovery}
        isPending={isPending}
        onDelete={handleDeleteUnlinkedAuthUser}
      />
      <ManagersTable
        managers={managers}
        onEdit={setEditingManager}
      />
      <EditManagerDialog
        manager={editingManager}
        isPending={isPending}
        onClose={() => setEditingManager(null)}
        onSubmit={handleUpdateManager}
      />
    </div>
  );
}
