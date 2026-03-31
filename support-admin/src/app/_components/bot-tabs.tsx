import { BotOption } from "../_lib/page-types";
import { getQueryString } from "../_lib/page-utils";

const tabsWrapperClassName = "mt-6 flex flex-wrap gap-2";
const activeTabClassName =
  "support-surface-accent rounded-full px-4 py-2 text-sm font-medium";
const inactiveTabClassName =
  "support-surface-default support-text-secondary rounded-full px-4 py-2 text-sm font-medium transition hover:border-slate-950 hover:text-slate-950";

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
          <a
            key={bot.key}
            href={getQueryString(bot.key)}
            className={isActive ? activeTabClassName : inactiveTabClassName}
          >
            {bot.label}
          </a>
        );
      })}
    </div>
  );
}
