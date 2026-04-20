"use server";

import { revalidatePath } from "next/cache";
import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type ManagerRole = "admin" | "support" | "supervisor";

type ActionResult = {
  success: boolean;
  error: string | null;
};

type CreateAuthUserInput = {
  email: string;
  password: string;
};

type AddManagerInput = {
  email: string;
  displayName: string;
  lastName: string;
  role: ManagerRole;
};

type UpdateManagerInput = {
  managerId: string;
  displayName: string;
  lastName: string;
  role: ManagerRole;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedRoles = new Set<ManagerRole>(["admin", "support", "supervisor"]);

function createErrorResult(error: string): ActionResult {
  return {
    success: false,
    error,
  };
}

function createSuccessResult(): ActionResult {
  return {
    success: true,
    error: null,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeNullableText(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isManagerRole(role: string): role is ManagerRole {
  return allowedRoles.has(role as ManagerRole);
}

async function requireCurrentAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Нужно войти в админ-панель.");
  }

  const { data: manager, error: managerError } = await supabase
    .from("managers")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();

  if (managerError || !manager) {
    throw new Error("Профиль менеджера не найден.");
  }

  if (manager.role !== "admin") {
    throw new Error("Только admin может управлять пользователями и менеджерами.");
  }

  return manager;
}

async function findAuthUserByEmail(email: string): Promise<User | null> {
  const supabaseAdmin = createSupabaseAdminClient();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error("Не удалось проверить пользователей Supabase Auth.");
    }

    const foundUser = data.users.find((user) => user.email?.toLowerCase() === email);

    if (foundUser) {
      return foundUser;
    }

    if (data.users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

export async function createAuthUserAction(input: CreateAuthUserInput): Promise<ActionResult> {
  const email = normalizeEmail(input.email);
  const password = input.password;

  if (!emailPattern.test(email)) {
    return createErrorResult("Введите корректный email.");
  }

  if (password.length < 6) {
    return createErrorResult("Пароль должен быть не короче 6 символов.");
  }

  try {
    await requireCurrentAdmin();

    const existingUser = await findAuthUserByEmail(email);
    if (existingUser) {
      return createErrorResult("Пользователь с такой почтой уже существует.");
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      console.error("Failed to create auth user:", error);
      return createErrorResult("Не удалось создать пользователя.");
    }

    revalidatePath("/");
    return createSuccessResult();
  } catch (error) {
    console.error("Create auth user action failed:", error);
    return createErrorResult(error instanceof Error ? error.message : "Не удалось создать пользователя.");
  }
}

export async function addManagerAction(input: AddManagerInput): Promise<ActionResult> {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim() || email;
  const lastName = normalizeNullableText(input.lastName);
  const role = input.role;

  if (!emailPattern.test(email)) {
    return createErrorResult("Введите корректный email.");
  }

  if (!isManagerRole(role)) {
    return createErrorResult("Выберите корректную роль.");
  }

  try {
    await requireCurrentAdmin();

    const authUser = await findAuthUserByEmail(email);
    if (!authUser) {
      return createErrorResult("Сначала создайте пользователя в Supabase Auth.");
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { data: existingManager, error: existingManagerError } = await supabaseAdmin
      .from("managers")
      .select("id")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();

    if (existingManagerError) {
      console.error("Failed to check existing manager:", existingManagerError);
      return createErrorResult("Не удалось проверить менеджера.");
    }

    if (existingManager) {
      return createErrorResult("Этот пользователь уже добавлен в managers.");
    }

    const { error } = await supabaseAdmin.from("managers").insert({
      auth_user_id: authUser.id,
      email,
      display_name: displayName,
      last_name: lastName,
      role,
    });

    if (error) {
      console.error("Failed to add manager:", error);
      return createErrorResult("Не удалось добавить менеджера.");
    }

    revalidatePath("/");
    return createSuccessResult();
  } catch (error) {
    console.error("Add manager action failed:", error);
    return createErrorResult(error instanceof Error ? error.message : "Не удалось добавить менеджера.");
  }
}

export async function updateManagerAction(input: UpdateManagerInput): Promise<ActionResult> {
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
    return createSuccessResult();
  } catch (error) {
    console.error("Update manager action failed:", error);
    return createErrorResult(error instanceof Error ? error.message : "Не удалось обновить менеджера.");
  }
}
