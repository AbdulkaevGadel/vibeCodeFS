export type ManagerAccountRecovery = {
  authUserId: string;
  email: string;
};

export type ManageManagersActionResult = {
  success: boolean;
  error: string | null;
  recovery: ManagerAccountRecovery | null;
};
