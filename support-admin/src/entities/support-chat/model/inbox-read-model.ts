import { getBotKey, getBotLabel } from "../lib";
import type {
  SupportChatBotOption,
  SupportChatInboxCursor,
  SupportChatInboxPage,
  SupportChatInboxPageInfo,
  SupportChatStatus,
  SupportChatSummary,
} from "./types";
import type { MessageSenderType } from "@/entities/chat-message";

export const supportChatInboxPageLimit = 50;

export type InboxSummaryRow = {
  id: string;
  telegram_chat_id: number;
  bot_username: string;
  status: SupportChatStatus;
  client_telegram_user_id: number;
  client_username: string | null;
  client_first_name: string | null;
  client_last_name: string | null;
  assigned_manager_id: string | null;
  assigned_manager_display_name: string | null;
  assigned_manager_last_name: string | null;
  last_message_at: string | null;
  last_message_text: string | null;
  last_message_sender_type: MessageSenderType | null;
  last_read_at: string | null;
  unread_count: number;
  message_count: number;
  created_at: string;
  updated_at: string;
};

export type BotStatsRow = {
  bot_username: string;
  chat_count: number;
  message_count: number;
};

export const emptySupportChatInboxPageInfo: SupportChatInboxPageInfo = {
  hasMore: false,
  nextCursor: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getPersonName(person: {
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}) {
  if (person.username?.trim()) {
    return `@${person.username}`;
  }

  const fullName = [person.firstName, person.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || "Без имени";
}

function getFullName(person: { firstName: string | null; lastName: string | null }) {
  const fullName = [person.firstName, person.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || null;
}

function getMessagePreview(text: string | null) {
  if (!text?.trim()) {
    return "Без текста";
  }

  return text.length > 72 ? `${text.slice(0, 72)}...` : text;
}

export function mapSupportChatInboxSummary(row: InboxSummaryRow): SupportChatSummary {
  const assignedManagerName = [row.assigned_manager_display_name, row.assigned_manager_last_name]
    .filter(Boolean)
    .join(" ");

  return {
    id: row.id,
    telegramChatId: row.telegram_chat_id,
    botUsername: row.bot_username,
    status: row.status,
    title: getPersonName({
      username: row.client_username,
      firstName: row.client_first_name,
      lastName: row.client_last_name,
    }),
    fullName: getFullName({
      firstName: row.client_first_name,
      lastName: row.client_last_name,
    }),
    subtitle: getMessagePreview(row.last_message_text),
    username: row.client_username,
    assignedManagerId: row.assigned_manager_id,
    assignedManagerName: assignedManagerName || null,
    telegramUserId: row.client_telegram_user_id,
    lastMessageAt: row.last_message_at,
    lastReadAt: row.last_read_at,
    unreadCount: row.unread_count,
    messageCount: row.message_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSupportChatBotStats(rows: BotStatsRow[]) {
  return rows
    .map((row) => ({
      botUsername: row.bot_username,
      chatCount: row.chat_count,
      messageCount: row.message_count,
      option: {
        key: getBotKey(row.bot_username),
        label: getBotLabel(row.bot_username),
        value: row.bot_username,
      } satisfies SupportChatBotOption,
    }))
    .sort((left, right) =>
      left.option.label.localeCompare(right.option.label, "ru", { sensitivity: "base" }),
    );
}

function isChatInboxCursor(value: unknown): value is SupportChatInboxCursor {
  if (!isRecord(value)) return false;

  return (
    (typeof value.lastMessageAt === "string" || value.lastMessageAt === null) &&
    typeof value.createdAt === "string" &&
    typeof value.chatId === "string"
  );
}

function mapInboxPageInfo(value: unknown): SupportChatInboxPageInfo {
  if (!isRecord(value) || typeof value.hasMore !== "boolean") {
    return emptySupportChatInboxPageInfo;
  }

  const nextCursor = value.nextCursor;

  return {
    hasMore: value.hasMore,
    nextCursor: value.hasMore && isChatInboxCursor(nextCursor) ? nextCursor : null,
  };
}

export function mapSupportChatInboxPage(value: unknown): SupportChatInboxPage {
  if (!isRecord(value) || !Array.isArray(value.rows)) {
    return {
      rows: [],
      pageInfo: emptySupportChatInboxPageInfo,
    };
  }

  return {
    rows: (value.rows as InboxSummaryRow[]).map(mapSupportChatInboxSummary),
    pageInfo: mapInboxPageInfo(value.pageInfo),
  };
}
