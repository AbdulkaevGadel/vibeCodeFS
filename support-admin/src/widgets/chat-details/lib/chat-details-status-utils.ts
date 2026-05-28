import type { SupportChatStatus } from "@/entities/support-chat";

export function getStatusChangeConfirmation(status: SupportChatStatus) {
  if (status === "open") {
    return "Вы уверены, что хотите сбросить чат в 'open'? Это удалит текущее назначение на менеджера.";
  }

  if (status === "waiting_operator") {
    return "Перевести чат в Needs help? Текущее назначение на менеджера будет снято.";
  }

  if (status === "resolved") {
    return "Завершить этот диалог?";
  }

  return `Вы уверены, что хотите изменить статус на '${status}'?`;
}
