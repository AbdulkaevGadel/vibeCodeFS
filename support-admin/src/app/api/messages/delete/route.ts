import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

function redirectWithStatus(request: NextRequest, status: string, bot?: string, chat?: string) {
  const url = new URL("/", request.url);

  if (bot) {
    url.searchParams.set("bot", bot);
  }

  if (chat) {
    url.searchParams.set("chat", chat);
  }

  url.searchParams.set("status", status);
  return NextResponse.redirect(url);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const messageId = formData.get("messageId")?.toString();
  const bot = formData.get("bot")?.toString();
  const chat = formData.get("chat")?.toString();

  if (!messageId) {
    return redirectWithStatus(request, "delete-error", bot, chat);
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("messages").delete().eq("id", Number(messageId));

    if (error) {
      console.error(error);
      return redirectWithStatus(request, "delete-error", bot, chat);
    }

    revalidatePath("/");
    return redirectWithStatus(request, "message-deleted", bot, chat);
  } catch (error) {
    console.error(error);
    return redirectWithStatus(request, "delete-error", bot, chat);
  }
}
