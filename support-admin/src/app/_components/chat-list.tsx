import { ChatSummary } from "../_lib/page-types";
import { ChatListItem } from "./chat-list-item";

const chatListClassName = "support-panel p-4";
const chatListHeaderClassName = "mb-4 px-2";
const chatListEyebrowClassName = "support-text-muted text-xs uppercase tracking-[0.3em]";
const chatListTitleClassName = "support-text-primary mt-2 text-xl font-semibold";
const emptyStateClassName =
  "support-text-secondary support-surface-muted rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm";
const itemsWrapperClassName = "space-y-3";

type ChatListProps = {
  chatSummaries: ChatSummary[];
  selectedChatId: number | null;
  selectedBotKey: string | null;
};

export function ChatList({ chatSummaries, selectedChatId, selectedBotKey }: ChatListProps) {
  return (
    <aside className={chatListClassName}>
      <div className={chatListHeaderClassName}>
        <p className={chatListEyebrowClassName}>Чаты</p>
        <h2 className={chatListTitleClassName}>Список по алфавиту</h2>
      </div>

      {chatSummaries.length === 0 ? (
        <div className={emptyStateClassName}>Для выбранного бота пока нет чатов.</div>
      ) : (
        <div className={itemsWrapperClassName}>
          {chatSummaries.map((chat) => (
            <ChatListItem
              key={chat.chatId}
              chat={chat}
              isActive={selectedChatId === chat.chatId}
              selectedBotKey={selectedBotKey}
            />
          ))}
        </div>
      )}
    </aside>
  );
}
