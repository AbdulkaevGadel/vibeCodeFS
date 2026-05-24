import type { Manager } from "@/entities/manager";
import type {
  ManageManagersActionResult,
} from "@/features/manage-managers";

export type ManagersAdminActions = {
  createManagerAccount: (input: {
    email: string;
    password: string;
    displayName: string;
    lastName: string;
  }) => Promise<ManageManagersActionResult>;
  deleteUnlinkedAuthUser: (input: {
    authUserId: string;
    email: string;
  }) => Promise<ManageManagersActionResult>;
  updateManager: (input: {
    managerId: string;
    displayName: string;
    lastName: string;
    role: Manager["role"];
  }) => Promise<ManageManagersActionResult>;
};

export type ManagersAdminPanelProps = {
  managers: Manager[];
  actions: ManagersAdminActions;
};
