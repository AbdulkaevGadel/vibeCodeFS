export const flashCookieName = "support_admin_flash";

export type FlashStatus = "message-deleted" | "chat-deleted" | "delete-error";

export function isFlashStatus(value: string | undefined): value is FlashStatus {
  return (
    value === "message-deleted" ||
    value === "chat-deleted" ||
    value === "delete-error"
  );
}
