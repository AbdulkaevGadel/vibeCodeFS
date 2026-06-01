import { FormEvent, useState } from "react";
import { isManagerRole, type Manager, type ManagerRole } from "@/entities/manager";
import type { ManageManagersActionResult } from "@/features/manage-managers/model";
import type { ManagersAdminActions } from "./types";

type ManagerUpdateInput = Parameters<ManagersAdminActions["updateManager"]>[0];

type RunManagersAdminActionOptions = {
  onSuccess?: () => void;
  onFailure?: () => void;
};

type RunManagersAdminAction = (
  action: () => Promise<ManageManagersActionResult>,
  successMessage: string,
  options?: RunManagersAdminActionOptions,
) => void;

type UseManagerUpdateFlowInput = {
  currentManager: Manager | null;
  updateManager: ManagersAdminActions["updateManager"];
  runAction: RunManagersAdminAction;
};

function readManagerRoleFromForm(formData: FormData) {
  const role = formData.get("role")?.toString();
  return isManagerRole(role) ? role : "support";
}

function shouldConfirmOwnAdminRoleChange(
  currentManagerId: string | null,
  editedManagerId: string,
  nextRole: ManagerRole,
) {
  return currentManagerId === editedManagerId && nextRole !== "admin";
}

function getOwnRoleChangeConfirmDescription(role: ManagerRole) {
  return `Вы меняете свою роль на ${role}. После сохранения вы потеряете права администратора и не сможете самостоятельно вернуть роль admin. Вернуть её сможет только другой администратор.`;
}

export function useManagerUpdateFlow({
  currentManager,
  updateManager,
  runAction,
}: UseManagerUpdateFlowInput) {
  const [editingManager, setEditingManager] = useState<Manager | null>(null);
  const [pendingOwnRoleChange, setPendingOwnRoleChange] = useState<ManagerUpdateInput | null>(null);

  const closeEditDialog = () => {
    setEditingManager(null);
    setPendingOwnRoleChange(null);
  };

  const executeManagerUpdate = (
    input: ManagerUpdateInput,
    onSuccess?: () => void,
  ) => {
    runAction(
      () => updateManager(input),
      "Менеджер обновлён.",
      {
        onSuccess: () => {
          setPendingOwnRoleChange(null);
          onSuccess?.();
        },
        onFailure: () => setPendingOwnRoleChange(null),
      },
    );
  };

  const requestManagerUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingManager) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const role = readManagerRoleFromForm(formData);
    const updateInput: ManagerUpdateInput = {
      managerId: editingManager.id,
      displayName: formData.get("displayName")?.toString() ?? "",
      lastName: formData.get("lastName")?.toString() ?? "",
      role,
    };

    if (
      shouldConfirmOwnAdminRoleChange(
        currentManager?.id ?? null,
        editingManager.id,
        role,
      )
    ) {
      setPendingOwnRoleChange(updateInput);
      return;
    }

    executeManagerUpdate(updateInput, () => setEditingManager(null));
  };

  const confirmOwnRoleChange = () => {
    if (!pendingOwnRoleChange) {
      return;
    }

    executeManagerUpdate(pendingOwnRoleChange, () => setEditingManager(null));
  };

  return {
    editingManager,
    pendingOwnRoleChangeDescription: pendingOwnRoleChange
      ? getOwnRoleChangeConfirmDescription(pendingOwnRoleChange.role)
      : "",
    isOwnRoleChangeConfirmOpen: pendingOwnRoleChange !== null,
    openEditDialog: setEditingManager,
    closeEditDialog,
    requestManagerUpdate,
    confirmOwnRoleChange,
    cancelOwnRoleChange: () => setPendingOwnRoleChange(null),
  };
}
