const chatStatsGridClassName = "grid gap-3 md:grid-cols-3";
const darkStatCardClassName = "support-surface-accent rounded-2xl px-4 py-3";
const lightStatCardClassName = "support-surface-default rounded-2xl px-4 py-3";
const statLabelOnDarkClassName = "text-xs uppercase tracking-[0.24em] text-white/60";
const statLabelClassName = "support-text-muted text-xs uppercase tracking-[0.24em]";
const darkStatValueClassName = "mt-2 text-lg font-semibold";
const statValueClassName = "support-text-primary mt-2 text-2xl font-semibold";

type ChatHeaderStatsProps = {
  botLabel: string;
  messageCount: number;
  chatCount: number;
};

export function ChatHeaderStats({
  botLabel,
  messageCount,
  chatCount,
}: ChatHeaderStatsProps) {
  return (
    <div className={chatStatsGridClassName}>
      <div className={darkStatCardClassName}>
        <p className={statLabelOnDarkClassName}>Бот</p>
        <p className={darkStatValueClassName}>{botLabel}</p>
      </div>
      <div className={lightStatCardClassName}>
        <p className={statLabelClassName}>Сообщений</p>
        <p className={statValueClassName}>{messageCount}</p>
      </div>
      <div className={lightStatCardClassName}>
        <p className={statLabelClassName}>Чатов</p>
        <p className={statValueClassName}>{chatCount}</p>
      </div>
    </div>
  );
}
