export type ManagerRole = "admin" | "support" | "supervisor";

export const managerRoles = ["admin", "support", "supervisor"] as const satisfies readonly ManagerRole[];

export type Manager = {
  id: string;
  email: string | null;
  displayName: string;
  lastName: string | null;
  role: ManagerRole;
};

export function isManagerRole(value: unknown): value is ManagerRole {
  return typeof value === "string" && managerRoles.includes(value as ManagerRole);
}

export function coerceManagerRole(value: unknown): ManagerRole {
  return isManagerRole(value) ? value : "support";
}
