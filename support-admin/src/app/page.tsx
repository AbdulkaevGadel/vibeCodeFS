import { createSupabaseClient } from "@/lib/supabase";
import { ConfirmSubmitButton } from "./confirm-submit-button";
import { RefreshButton } from "./refresh-button";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;

type PageProps = {
  searchParams?: Promise<{
    bot?: SearchParamValue;
    chat?: SearchParamValue;
    status?: SearchParamValue;
  }>;
};

type Message = {
  id: number;
  bot_username: string | null;
  chat_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  text: string | null;
  created_at: string;
};

type BotOption = {
  key: string;
  label: string;
  value: string | null;
};

type ChatSummary = {
  chatId: number;
  title: string;
  fullName: string | null;
  subtitle: string;
  username: string | null;
  lastMessageAt: string;
  messageCount: number;
};

const unknownBotKey = "__unknown_bot__";

function getSingleValue(value: SearchParamValue) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function getBotKey(botUsername: string | null) {
  return botUsername?.trim() || unknownBotKey;
}

function getBotLabel(botUsername: string | null) {
  return botUsername?.trim() ? `@${botUsername}` : "Без имени бота";
}

function getPersonName(message: Pick<Message, "username" | "first_name" | "last_name">) {
  if (message.username?.trim()) {
    return `@${message.username}`;
  }

  const fullName = [message.first_name, message.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || "Без имени";
}

function getFullName(message: Pick<Message, "first_name" | "last_name">) {
  const fullName = [message.first_name, message.last_name]
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

function getStatusMessage(status: string | undefined) {
  if (status === "message-deleted") {
    return "Сообщение удалено.";
  }

  if (status === "chat-deleted") {
    return "Чат удалён из списка вместе со всеми сообщениями.";
  }

  if (status === "delete-error") {
    return "Удаление не выполнено. Проверь серверные env-переменные Supabase.";
  }

  return null;
}

function buildBotOptions(messages: Message[]) {
  const botMap = new Map<string, BotOption>();

  for (const message of messages) {
    const key = getBotKey(message.bot_username);

    if (!botMap.has(key)) {
      botMap.set(key, {
        key,
        label: getBotLabel(message.bot_username),
        value: message.bot_username,
      });
    }
  }

  return Array.from(botMap.values()).sort((left, right) =>
    left.label.localeCompare(right.label, "ru", { sensitivity: "base" }),
  );
}

function buildChatSummaries(messages: Message[]) {
  const chatMap = new Map<number, ChatSummary>();

  for (const message of messages) {
    const existingChat = chatMap.get(message.chat_id);
    const title = getPersonName(message);
    const fullName = getFullName(message);
    const subtitle = getMessagePreview(message.text);

    if (!existingChat) {
      chatMap.set(message.chat_id, {
        chatId: message.chat_id,
        title,
        fullName,
        subtitle,
        username: message.username,
        lastMessageAt: message.created_at,
        messageCount: 1,
      });
      continue;
    }

    existingChat.messageCount += 1;

    if (new Date(message.created_at).getTime() > new Date(existingChat.lastMessageAt).getTime()) {
      existingChat.lastMessageAt = message.created_at;
      existingChat.subtitle = subtitle;
    }
  }

  return Array.from(chatMap.values()).sort((left, right) => {
    const titleCompare = left.title.localeCompare(right.title, "ru", { sensitivity: "base" });

    if (titleCompare !== 0) {
      return titleCompare;
    }

    return left.chatId - right.chatId;
  });
}

function getQueryString(
  botKey: string | null,
  chatId?: number | null,
) {
  const params = new URLSearchParams();

  if (botKey) {
    params.set("bot", botKey);
  }

  if (chatId) {
    params.set("chat", String(chatId));
  }

  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export default async function Home({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const selectedBotParam = getSingleValue(params.bot);
  const selectedChatParam = getSingleValue(params.chat);
  const statusParam = getSingleValue(params.status);

  let messages: Message[] = [];
  let errorMessage: string | null = null;

  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      errorMessage = "Не удалось загрузить сообщения.";
      console.error(error);
    } else {
      messages = (data ?? []) as Message[];
    }
  } catch (error) {
    errorMessage = "Проверь NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY.";
    console.error(error);
  }

  const botOptions = buildBotOptions(messages);
  const selectedBot =
    botOptions.find((bot) => bot.key === selectedBotParam) ?? botOptions[0] ?? null;
  const botFilteredMessages = selectedBot
    ? messages.filter((message) => getBotKey(message.bot_username) === selectedBot.key)
    : messages;
  const chatSummaries = buildChatSummaries(botFilteredMessages);
  const selectedChatId = Number(selectedChatParam);
  const selectedChat =
    chatSummaries.find((chat) => chat.chatId === selectedChatId) ?? chatSummaries[0] ?? null;
  const selectedChatMessages = selectedChat
    ? botFilteredMessages
        .filter((message) => message.chat_id === selectedChat.chatId)
        .sort(
          (left, right) =>
            new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
        )
    : [];
  const statusMessage = getStatusMessage(statusParam);
  const headerBotLabel = selectedBot?.label || "Нет данных по ботам";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(244,114,182,0.16),_transparent_28%),linear-gradient(180deg,_#fffdf8_0%,_#f6efe7_100%)] p-6 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_24px_80px_rgba(148,163,184,0.14)] backdrop-blur">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
                SupportBot Admin
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                {headerBotLabel}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Одна страница для просмотра сообщений, выбора чатов и безопасного удаления
                через серверную сторону.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex justify-start xl:justify-end">
                <RefreshButton />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-white">
                  <p className="text-xs uppercase tracking-[0.24em] text-white/60">Бот</p>
                  <p className="mt-2 text-lg font-semibold">{headerBotLabel}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Сообщений</p>
                  <p className="mt-2 text-2xl font-semibold">{botFilteredMessages.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Чатов</p>
                  <p className="mt-2 text-2xl font-semibold">{chatSummaries.length}</p>
                </div>
              </div>
            </div>
          </div>

          {botOptions.length > 0 ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {botOptions.map((bot) => {
                const isActive = selectedBot?.key === bot.key;

                return (
                  <a
                    key={bot.key}
                    href={getQueryString(bot.key)}
                    className={
                      isActive
                        ? "rounded-full border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-medium text-white"
                        : "rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
                    }
                  >
                    {bot.label}
                  </a>
                );
              })}
            </div>
          ) : null}
        </header>

        {statusMessage ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {statusMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : (
          <section className="mt-6 grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
            <aside className="rounded-[28px] border border-white/70 bg-white/88 p-4 shadow-[0_24px_80px_rgba(148,163,184,0.14)] backdrop-blur">
              <div className="mb-4 px-2">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Чаты</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">
                  Список по алфавиту
                </h2>
              </div>

              {chatSummaries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  Для выбранного бота пока нет чатов.
                </div>
              ) : (
                <div className="space-y-3">
                  {chatSummaries.map((chat) => {
                    const isActive = selectedChat?.chatId === chat.chatId;

                    return (
                      <a
                        key={chat.chatId}
                        href={getQueryString(selectedBot?.key ?? null, chat.chatId)}
                        className={
                          isActive
                            ? "block rounded-2xl border border-slate-950 bg-slate-950 px-4 py-4 text-white shadow-lg"
                            : "block rounded-2xl border border-slate-200 bg-white px-4 py-4 text-slate-900 transition hover:-translate-y-0.5 hover:border-slate-950 hover:shadow-md"
                        }
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold">{chat.title}</p>
                            {chat.fullName ? (
                              <p
                                className={
                                  isActive
                                    ? "mt-1 truncate text-xs text-white/70"
                                    : "mt-1 truncate text-xs text-slate-400"
                                }
                              >
                                {chat.fullName}
                              </p>
                            ) : null}
                            <p
                              className={
                                isActive
                                  ? "mt-2 truncate text-sm text-white/82"
                                  : "mt-2 truncate text-sm text-slate-500"
                              }
                            >
                              {chat.subtitle}
                            </p>
                          </div>
                          <span
                            className={
                              isActive
                                ? "rounded-full bg-white/12 px-2 py-1 text-xs font-medium text-white"
                                : "rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
                            }
                          >
                            {chat.messageCount}
                          </span>
                        </div>

                        <div
                          className={
                            isActive
                              ? "mt-4 flex items-center justify-between text-xs text-white/65"
                              : "mt-4 flex items-center justify-between text-xs text-slate-400"
                          }
                        >
                          <span>chat_id: {chat.chatId}</span>
                          <span>{new Date(chat.lastMessageAt).toLocaleDateString("ru-RU")}</span>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </aside>

            <section className="rounded-[28px] border border-white/70 bg-white/88 p-5 shadow-[0_24px_80px_rgba(148,163,184,0.14)] backdrop-blur">
              {selectedChat ? (
                <>
                  <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                        Диалог
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                        {selectedChat.title}
                      </h2>
                      {selectedChat.fullName ? (
                        <p className="mt-2 text-sm text-slate-500">{selectedChat.fullName}</p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span className="rounded-full bg-slate-100 px-3 py-1">
                          chat_id: {selectedChat.chatId}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1">
                          сообщений: {selectedChatMessages.length}
                        </span>
                      </div>
                    </div>

                    <form action="/api/chats/delete" method="post">
                      <input type="hidden" name="chatId" value={selectedChat.chatId} />
                      <input type="hidden" name="bot" value={selectedBot?.key ?? ""} />
                      <ConfirmSubmitButton
                        message="Удалить весь чат и все его сообщения у выбранного бота?"
                        className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-100"
                      >
                        Удалить чат целиком
                      </ConfirmSubmitButton>
                    </form>
                  </div>

                  <div className="mt-5 space-y-4">
                    {selectedChatMessages.map((message, index) => (
                      <article
                        key={message.id}
                        className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] p-4 shadow-sm"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                              {index + 1}
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                {getPersonName(message)}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {new Date(message.created_at).toLocaleString("ru-RU")}
                              </p>
                            </div>
                          </div>

                          <form action="/api/messages/delete" method="post">
                            <input type="hidden" name="messageId" value={message.id} />
                            <input type="hidden" name="bot" value={selectedBot?.key ?? ""} />
                            <input type="hidden" name="chat" value={selectedChat.chatId} />
                            <ConfirmSubmitButton
                              message="Удалить это сообщение?"
                              className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                            >
                              Удалить сообщение
                            </ConfirmSubmitButton>
                          </form>
                        </div>

                        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-slate-700">
                          {message.text || "Пустое сообщение"}
                        </p>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex min-h-[440px] items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 text-center text-sm text-slate-500">
                  Выбери чат слева, чтобы посмотреть сообщения и действия по нему.
                </div>
              )}
            </section>
          </section>
        )}
      </div>
    </main>
  );
}
