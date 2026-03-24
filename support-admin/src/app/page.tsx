import { createSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Message = {
  id: number;
  chat_id: number | string;
  username: string | null;
  text: string | null;
  created_at: string;
};

export default async function Home() {
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
      messages = data ?? [];
    }
  } catch (error) {
    errorMessage = "Проверь NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY.";
    console.error(error);
  }

  return (
    <main className="p-6">
      <h1 className="mb-6 text-3xl font-semibold">SupportBot - Сообщения</h1>

      {errorMessage ? (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : messages.length === 0 ? (
        <div className="rounded border p-4 text-sm text-gray-500">
          Сообщений пока нет.
        </div>
      ) : (
        <div className="space-y-4">
          {messages.map((message) => (
            <article key={message.id} className="rounded border p-4">
              <p className="font-bold">{message.username || "Без username"}</p>
              <p className="mt-2 whitespace-pre-wrap">{message.text || "Пустое сообщение"}</p>
              <p className="mt-3 text-sm text-gray-500">
                {new Date(message.created_at).toLocaleString("ru-RU")}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                chat_id: {message.chat_id}
              </p>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
