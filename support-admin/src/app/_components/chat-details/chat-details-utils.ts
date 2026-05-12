import { Manager } from "../../_lib/page-types";

export function getManagerFullName(manager: Manager) {
  return [manager.displayName, manager.lastName].filter(Boolean).join(" ");
}
