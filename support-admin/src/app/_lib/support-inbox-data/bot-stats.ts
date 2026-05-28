import {
  mapSupportChatBotStats,
  type BotStatsRow,
  type SupportChatBotOption,
} from "@/entities/support-chat";
import type { SupabaseServerClient } from "./types";

export type SupportInboxBotStatsData = {
  botOptions: SupportChatBotOption[];
  selectedBot: SupportChatBotOption | null;
  botFilteredChatCount: number;
  botFilteredMessageCount: number;
  errorMessage: string | null;
};

export async function loadSupportInboxBotStats(
  supabase: SupabaseServerClient,
  selectedBotParam?: string,
): Promise<SupportInboxBotStatsData> {
  const { data, error } = await supabase
    .from("support_admin_bot_stats")
    .select("bot_username, chat_count, message_count")
    .order("bot_username");

  if (error) {
    console.error("Fetch support admin bot stats error:", error);

    return {
      botOptions: [],
      selectedBot: null,
      botFilteredChatCount: 0,
      botFilteredMessageCount: 0,
      errorMessage: "Не удалось загрузить статистику inbox.",
    };
  }

  const botStats = mapSupportChatBotStats((data ?? []) as BotStatsRow[]);
  const botOptions = botStats.map((stat) => stat.option);
  const selectedBot =
    botOptions.find((bot) => bot.key === selectedBotParam) ?? botOptions[0] ?? null;
  const selectedBotKey = selectedBot?.key ?? null;
  const selectedBotStats = selectedBotKey
    ? botStats.find((stat) => stat.option.key === selectedBotKey) ?? null
    : null;

  return {
    botOptions,
    selectedBot,
    botFilteredChatCount: selectedBotStats?.chatCount ?? 0,
    botFilteredMessageCount: selectedBotStats?.messageCount ?? 0,
    errorMessage: null,
  };
}
