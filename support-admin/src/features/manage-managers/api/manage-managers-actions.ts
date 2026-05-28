"use server";

import { revalidatePath } from "next/cache";
import { isManagerRole, type ManagerRole } from "@/entities/manager";
import { createSupabaseAdminClient } from "@/shared/api/supabase/admin-client";
import {
  createErrorResult,
  createRecoveryResult,
  createSuccessResult,
  emailPattern,
  isUuid,
  normalizeEmail,
  normalizeNullableText,
  requireCurrentAdmin,
} from "./manager-action-helpers";
import { getCreateAuthUserErrorMessage } from "./manager-auth-errors";
import type { ManageManagersActionResult } from "../model";

type CreateManagerAccountInput = {
  email: string;
  password: string;
  displayName: string;
  lastName: string;
};

type DeleteUnlinkedAuthUserInput = {
  authUserId: string;
  email: string;
};

type UpdateManagerInput = {
  managerId: string;
  displayName: string;
  lastName: string;
  role: ManagerRole;
};

export async function createManagerAccountAction(
  input: CreateManagerAccountInput,
): Promise<ManageManagersActionResult> {
  const email = normalizeEmail(input.email);
  const password = input.password;
  const displayName = input.displayName.trim();
  const lastName = normalizeNullableText(input.lastName);

  if (!emailPattern.test(email)) {
    return createErrorResult("Введите корректный email.");
  }

  if (password.length < 6) {
    return createErrorResult("Пароль должен быть не короче 6 символов.");
  }

  if (!displayName) {
    return createErrorResult("Display name обязателен.");
  }

  try {
    await requireCurrentAdmin();

    const supabaseAdmin = createSupabaseAdminClient();
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    const createdUser = authData.user;

    if (authError || !createdUser) {
      console.error("Failed to create manager auth user:", authError);
      return createErrorResult(getCreateAuthUserErrorMessage(authError));
    }

    const { error: insertError } = await supabaseAdmin.from("managers").insert({
      auth_user_id: createdUser.id,
      email,
      display_name: displayName,
      last_name: lastName,
      role: "support",
    });

    if (insertError) {
      console.error("Failed to create manager row after auth user creation:", insertError);

      const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(createdUser.id);
      if (!rollbackError) {
        return createErrorResult("Не удалось создать менеджера. Auth-пользователь был удалён автоматически.");
      }

      console.error("Failed to rollback manager auth user creation:", rollbackError);
      return createRecoveryResult(
        "Auth-пользователь создан, но строка managers не создана. Автоматическое удаление не удалось.",
        {
          authUserId: createdUser.id,
          email,
        },
      );
    }

    revalidatePath("/");
    revalidatePath("/managers");
    return createSuccessResult();
  } catch (error) {
    console.error("Create manager account action failed:", error);
    return createErrorResult(error instanceof Error ? error.message : "Не удалось создать менеджера.");
  }
}

export async function deleteUnlinkedAuthUserAction(
  input: DeleteUnlinkedAuthUserInput,
): Promise<ManageManagersActionResult> {
  const authUserId = input.authUserId.trim();
  const email = normalizeEmail(input.email);

  if (!isUuid(authUserId)) {
    return createErrorResult("Некорректный Auth user id.");
  }

  if (!emailPattern.test(email)) {
    return createErrorResult("Некорректный email для recovery.");
  }

  try {
    await requireCurrentAdmin();

    const supabaseAdmin = createSupabaseAdminClient();
    const { data: linkedManager, error: linkedManagerError } = await supabaseAdmin
      .from("managers")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (linkedManagerError) {
      console.error("Failed to verify unlinked auth user before recovery delete:", linkedManagerError);
      return createErrorResult("Не удалось проверить связь Auth user и managers.");
    }

    if (linkedManager) {
      return createErrorResult("Auth user уже связан с менеджером. Recovery delete запрещён.");
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
    if (deleteError) {
      console.error("Failed to delete unlinked auth user during recovery:", deleteError);
      return createRecoveryResult("Не удалось удалить незавершённый Auth account.", {
        authUserId,
        email,
      });
    }

    revalidatePath("/");
    revalidatePath("/managers");
    return createSuccessResult();
  } catch (error) {
    console.error("Delete unlinked auth user action failed:", error);
    return createErrorResult(error instanceof Error ? error.message : "Не удалось удалить незавершённый Auth account.");
  }
}

export async function updateManagerAction(input: UpdateManagerInput): Promise<ManageManagersActionResult> {
  const managerId = input.managerId.trim();
  const displayName = input.displayName.trim();
  const lastName = normalizeNullableText(input.lastName);
  const role = input.role;

  if (!managerId) {
    return createErrorResult("Менеджер не выбран.");
  }

  if (!displayName) {
    return createErrorResult("Display name обязателен при редактировании.");
  }

  if (!isManagerRole(role)) {
    return createErrorResult("Выберите корректную роль.");
  }

  try {
    await requireCurrentAdmin();

    const supabaseAdmin = createSupabaseAdminClient();
    const { error } = await supabaseAdmin
      .from("managers")
      .update({
        display_name: displayName,
        last_name: lastName,
        role,
        updated_at: new Date().toISOString(),
      })
      .eq("id", managerId);

    if (error) {
      console.error("Failed to update manager:", error);
      return createErrorResult("Не удалось обновить менеджера.");
    }

    revalidatePath("/");
    revalidatePath("/managers");
    return createSuccessResult();
  } catch (error) {
    console.error("Update manager action failed:", error);
    return createErrorResult(error instanceof Error ? error.message : "Не удалось обновить менеджера.");
  }
}
