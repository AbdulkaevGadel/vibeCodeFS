import type { Manager } from "../model";

export function getManagerFullName(manager: Manager) {
  return [manager.displayName, manager.lastName].filter(Boolean).join(" ");
}

export function getManagerDisplayLabel(manager: Manager) {
  return getManagerFullName(manager) || manager.email || "Менеджер";
}

export function isAdminManager(manager: Manager | null | undefined) {
  return manager?.role === "admin";
}

export function isPrivilegedManager(manager: Manager | null | undefined) {
  return manager?.role === "admin" || manager?.role === "supervisor";
}
