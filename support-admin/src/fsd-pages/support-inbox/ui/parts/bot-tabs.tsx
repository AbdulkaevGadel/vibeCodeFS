import type { SupportChatBotOption } from "@/entities/support-chat";
import { Button } from "@/shared/ui/button";
import { getSupportInboxQueryString } from "../../lib/get-support-inbox-query-string";

const tabsWrapperClassName = "mt-6 flex flex-wrap gap-2";

type BotTabsProps = {
  botOptions: SupportChatBotOption[];
  selectedBotKey: string | null;
};

export function BotTabs({ botOptions, selectedBotKey }: BotTabsProps) {
  if (botOptions.length === 0) {
    return null;
  }

  return (
    <div className={tabsWrapperClassName}>
      {botOptions.map((bot) => {
        const isActive = selectedBotKey === bot.key;

        return (
          <Button
            key={bot.key}
            href={getSupportInboxQueryString(bot.key)}
            variant="secondary"
            active={isActive}
            size="sm"
          >
            {bot.label}
          </Button>
        );
      })}
    </div>
  );
}
