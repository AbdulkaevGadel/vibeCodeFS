import type { FlashStatus } from "../flash-cookie";

export function getSupportInboxStatusVariant(status?: FlashStatus) {
  if (status === "delete-error") {
    return "error";
  }

  if (status === "message-deleted" || status === "chat-deleted") {
    return "success";
  }

  return null;
}
