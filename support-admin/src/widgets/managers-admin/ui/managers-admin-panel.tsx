"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  ManagerAccountRecovery,
  ManageManagersActionResult,
} from "@/features/manage-managers/model";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { useToastState } from "@/shared/ui/toast";
import type { ManagersAdminPanelProps } from "../model";
import { useManagerUpdateFlow } from "../model/use-manager-update-flow";
import { CreateManagerAccountForm } from "./create-manager-account-form";
import { EditManagerDialog } from "./edit-manager-dialog";
import { ManagerAdminMessages } from "./manager-admin-messages";
import { ManagerRecoveryPanel } from "./manager-recovery-panel";
import { ManagersTable } from "./managers-table";

const panelClassName = "mt-6 grid gap-4";

export function ManagersAdminPanel({
  managers,
  currentManager,
  actions,
}: ManagersAdminPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
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
    options?: {
      onSuccess?: () => void;
      onFailure?: () => void;
    },
  ) => {
    clearToast();

    startTransition(async () => {
      const result = await action();

      setRecovery(result.recovery);

      if (!result.success) {
        options?.onFailure?.();
        showToast(result.error ?? "Операция не выполнена.", "error");
        return;
      }

      showToast(successMessage, "success");
      options?.onSuccess?.();
      router.refresh();
    });
  };

  const managerUpdateFlow = useManagerUpdateFlow({
    currentManager,
    updateManager: actions.updateManager,
    runAction,
  });

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
      { onSuccess: () => form.reset() },
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
      { onSuccess: () => setRecovery(null) },
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
        onEdit={managerUpdateFlow.openEditDialog}
      />
      <EditManagerDialog
        manager={managerUpdateFlow.editingManager}
        isPending={isPending}
        onClose={managerUpdateFlow.closeEditDialog}
        onSubmit={managerUpdateFlow.requestManagerUpdate}
      />
      <ConfirmDialog
        isOpen={managerUpdateFlow.isOwnRoleChangeConfirmOpen}
        title="Подтвердите смену своей роли"
        description={managerUpdateFlow.pendingOwnRoleChangeDescription}
        confirmLabel="Сменить роль"
        cancelLabel="Отменить"
        isPending={isPending}
        onCancel={managerUpdateFlow.cancelOwnRoleChange}
        onConfirm={managerUpdateFlow.confirmOwnRoleChange}
      />
    </div>
  );
}
