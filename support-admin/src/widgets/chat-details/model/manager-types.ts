type ChatDetailsManagerRole = "admin" | "support" | "supervisor";

export type ChatDetailsManager = {
  id: string;
  email: string | null;
  displayName: string;
  lastName: string | null;
  role: ChatDetailsManagerRole;
};
