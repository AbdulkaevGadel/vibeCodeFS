import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { FlashStatus, flashCookieName } from "@/app/_lib/flash-cookie";

const unknownBotKey = "__unknown_bot__";

function redirectWithStatus(request: NextRequest, status: FlashStatus, bot?: string) {
  const url = new URL("/", request.url);

  if (bot) {
    url.searchParams.set("bot", bot);
  }

  const response = NextResponse.redirect(url);
  response.cookies.set(flashCookieName, status, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  return response;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const chatId = formData.get("chatId")?.toString();
  const bot = formData.get("bot")?.toString();

  if (!chatId) {
    return redirectWithStatus(request, "delete-error", bot);
  }

  try {
    const supabase = createSupabaseAdminClient();
    let query = supabase.from("messages").delete().eq("chat_id", Number(chatId));

    if (bot === unknownBotKey) {
      query = query.or("bot_username.is.null,bot_username.eq.");
    } else if (bot) {
      query = query.eq("bot_username", bot);
    }

    const { error } = await query;

    if (error) {
      console.error(error);
      return redirectWithStatus(request, "delete-error", bot);
    }

    revalidatePath("/");
    return redirectWithStatus(request, "chat-deleted", bot);
  } catch (error) {
    console.error(error);
    return redirectWithStatus(request, "delete-error", bot);
  }
}
