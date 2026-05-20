import { coerceManagerRole, type Manager } from "./types";

export type ManagerRow = {
  id: string;
  email: string | null;
  display_name: string;
  last_name: string | null;
  role: unknown;
};

export function mapManagerRow(row: ManagerRow): Manager {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    lastName: row.last_name,
    role: coerceManagerRole(row.role),
  };
}
