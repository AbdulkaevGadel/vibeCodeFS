import type { SupportChatSummary } from "@/entities/support-chat";
import type { Manager } from "@/entities/manager";

export type ComposerAvailability = {
  canSend: boolean;
  unavailableReason: string | null;
};

export function getComposerAvailability(
  selectedChat: SupportChatSummary,
  currentManager: Manager | null,
): ComposerAvailability {
  if (!currentManager) {
    return {
      canSend: false,
      unavailableReason: "Профиль менеджера не найден. Ответить клиенту нельзя.",
    };
  }

  if (selectedChat.status === "resolved" || selectedChat.status === "closed") {
    return {
      canSend: false,
      unavailableReason: "Диалог завершён. История сохранена, новые сообщения отправить нельзя.",
    };
  }

  // Admin и supervisor могут отвечать в любом активном чате.
  // Support-менеджеры ограничены назначением чата и правилами эскалации.
  switch (currentManager.role) {
    case "admin":
    case "supervisor":
      return {
        canSend: true,
        unavailableReason: null,
      };

    case "support":
      return getSupportComposerAvailability(selectedChat, currentManager);

    default:
      return {
        canSend: false,
        unavailableReason: "Ответ недоступен для вашей роли или текущего состояния чата.",
      };
  }
}

// Support может отвечать только когда чат назначен ему
// и не эскалирован на роль выше.
function getSupportComposerAvailability(
  selectedChat: SupportChatSummary,
  currentManager: Manager,
): ComposerAvailability {
  if (selectedChat.status === "escalated") {
    return {
      canSend: false,
      unavailableReason: "Чат эскалирован. Ответить может supervisor или admin.",
    };
  }

  if (selectedChat.assignedManagerId === currentManager.id) {
    return {
      canSend: true,
      unavailableReason: null,
    };
  }

  if (selectedChat.assignedManagerName) {
    return {
      canSend: false,
      unavailableReason: `Чат закреплён за ${selectedChat.assignedManagerName}. Ответить может назначенный менеджер.`,
    };
  }

  if (selectedChat.status !== "open" && selectedChat.status !== "waiting_operator") {
    return {
      canSend: false,
      unavailableReason: "Вы не назначены на этот чат. Ответить может назначенный менеджер.",
    };
  }

  return {
    canSend: false,
    unavailableReason: "Чтобы ответить клиенту, сначала возьмите чат в работу.",
  };
}
