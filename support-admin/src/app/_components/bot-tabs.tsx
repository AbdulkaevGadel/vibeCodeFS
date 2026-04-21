import { BotOption } from "../_lib/page-types";
import { getQueryString } from "../_lib/page-utils";

import { Button } from "./ui/button";

const tabsWrapperClassName = "mt-6 flex flex-wrap gap-2";

type BotTabsProps = {
  botOptions: BotOption[];
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
            href={getQueryString(bot.key)}
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
