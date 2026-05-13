"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  chatInboxPageLimit,
  mapInboxPage,
} from "../../_lib/get-support-admin-page-data";
import { getCurrentManagerId } from "../../_lib/manager-utils";
import type { ChatInboxCursor, ChatInboxPage } from "../../_lib/page-types";

type LoadChatInboxPageInput = {
  botUsername: string | null;
  cursor: ChatInboxCursor;
};

type LoadChatInboxPageResult =
  | {
      success: true;
      data: ChatInboxPage;
    }
  | {
      success: false;
      error: string;
    };

function isValidCursor(cursor: ChatInboxCursor) {
  return (
    (typeof cursor.lastMessageAt === "string" || cursor.lastMessageAt === null) &&
    typeof cursor.createdAt === "string" &&
    typeof cursor.chatId === "string" &&
    cursor.createdAt.length > 0 &&
    cursor.chatId.length > 0
  );
}

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Неизвестная ошибка";
}

export async function loadChatInboxPageAction(
  input: LoadChatInboxPageInput,
): Promise<LoadChatInboxPageResult> {
  try {
    if (!isValidCursor(input.cursor)) {
      return {
        success: false,
        error: "Некорректный cursor для загрузки следующей страницы.",
      };
    }

    await getCurrentManagerId();

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_support_admin_chat_inbox_page", {
      p_limit: chatInboxPageLimit,
      p_cursor_last_message_at: input.cursor.lastMessageAt,
      p_cursor_created_at: input.cursor.createdAt,
      p_cursor_chat_id: input.cursor.chatId,
      p_bot_username: input.botUsername,
    });

    if (error) {
      console.error("Load chat inbox page error:", error);
      return {
        success: false,
        error: "Не удалось загрузить следующую страницу чатов.",
      };
    }

    return {
      success: true,
      data: mapInboxPage(data),
    };
  } catch (error) {
    console.error("Failed to load chat inbox page:", error);
    return {
      success: false,
      error: `Не удалось загрузить следующую страницу: ${formatErrorMessage(error)}`,
    };
  }
}
