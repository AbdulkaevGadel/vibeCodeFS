import type { ReactNode } from "react";
import type { Manager } from "@/entities/manager";
import type { ManagersAdminActions } from "@/widgets/managers-admin";

export type ManagersAdminHeaderShellProps = {
  title: string;
  allManagers: Manager[];
  currentManager: Manager | null;
  navigationHref: string;
  navigationLabel: string;
  navigationActive?: boolean;
  managersNavigationActive?: boolean;
  stats: ReactNode;
  sidePanel: ReactNode;
};

export type ManagersAdminPageProps = {
  managers: Manager[];
  currentManager: Manager | null;
  errorMessage: string | null;
  actions: ManagersAdminActions;
  renderHeaderShell: (props: ManagersAdminHeaderShellProps) => ReactNode;
};
