import type { ChatMessage } from "@/entities/chat-message";
import { getManagerFullName } from "./chat-details-utils";
import type { ChatDetailsManager } from "../model/manager-types";

const messageCardClassName = "support-card p-4";

export function getSenderLabel(message: ChatMessage, chatTitle: string, allManagers: ChatDetailsManager[]) {
  if (message.senderType === "manager") {
    if (message.managerId) {
      const manager = allManagers.find((item) => item.id === message.managerId);
      if (manager) return getManagerFullName(manager);
    }

    return "Менеджер";
  }

  if (message.senderType === "ai") return "ИИ-помощник";
  if (message.senderType === "system") return "Система";
  return chatTitle;
}

export function isOutgoingMessage(message: ChatMessage) {
  return message.senderType === "manager" || message.senderType === "ai";
}

export function getMessageCardClassName(message: ChatMessage) {
  const baseClassName = `relative max-w-[80%] ${messageCardClassName} transition hover:shadow-md`;

  if (message.senderType === "manager") {
    return `${baseClassName} ml-auto border-l-4 border-l-slate-900 bg-white`;
  }

  if (message.senderType === "ai") {
    return `${baseClassName} ml-auto border-l-4 border-l-indigo-500 bg-indigo-50 ring-1 ring-indigo-100`;
  }

  if (message.senderType === "system") {
    return `${baseClassName} mx-auto max-w-[90%] border-dashed bg-slate-100`;
  }

  return `${baseClassName} mr-auto bg-slate-50`;
}

export function getSafeDeliveryError(deliveryError: string | null) {
  if (!deliveryError) return undefined;

  const normalized = deliveryError.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;

  const unsafePatterns = [
    /authorization/i,
    /bearer\s+[a-z0-9._-]+/i,
    /token/i,
    /secret/i,
    /service[_-]?role/i,
    /internal_secret/i,
    /hf_[a-z0-9_]*api/i,
    /https?:\/\/\S+\?\S+/i,
    /\bat\s+\S+\s+\(/i,
  ];
  const looksStructuredPayload = /^[{[]/.test(normalized);
  const looksUnsafe = looksStructuredPayload || unsafePatterns.some((pattern) => pattern.test(normalized));

  if (looksUnsafe) return "Ошибка доставки";

  const maxLength = 140;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

export function getDeliveryBadgeLabel(deliveryStatus: ChatMessage["deliveryStatus"]) {
  if (deliveryStatus === "pending") return "⏳ Отправка";
  if (deliveryStatus === "sent") return "✅ Доставлено";
  return "❌ Ошибка";
}

export function getDeliveryBadgeVariant(deliveryStatus: ChatMessage["deliveryStatus"]) {
  if (deliveryStatus === "pending") return "warning";
  if (deliveryStatus === "sent") return "success";
  return "danger";
}
