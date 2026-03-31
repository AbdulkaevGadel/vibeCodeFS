import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { FlashStatus, flashCookieName } from "@/app/_lib/flash-cookie";
import { getStatusMessage } from "@/app/_lib/page-utils";

function isFetchRequest(request: NextRequest) {
  return request.headers.get("x-requested-with") === "fetch";
}

function jsonStatus(status: FlashStatus, statusCode = 200) {
  return NextResponse.json(
    {
      ok: status !== "delete-error",
      status,
      message: getStatusMessage(status),
    },
    { status: statusCode },
  );
}

function redirectWithStatus(
  request: NextRequest,
  status: FlashStatus,
  bot?: string,
  chat?: string,
) {
  const url = new URL("/", request.url);

  if (bot) {
    url.searchParams.set("bot", bot);
  }

  if (chat) {
    url.searchParams.set("chat", chat);
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
  const messageId = formData.get("messageId")?.toString();
  const bot = formData.get("bot")?.toString();
  const chat = formData.get("chat")?.toString();

  if (!messageId) {
    if (isFetchRequest(request)) {
      return jsonStatus("delete-error", 400);
    }
    return redirectWithStatus(request, "delete-error", bot, chat);
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("messages").delete().eq("id", Number(messageId));

    if (error) {
      console.error(error);
      if (isFetchRequest(request)) {
        return jsonStatus("delete-error", 500);
      }
      return redirectWithStatus(request, "delete-error", bot, chat);
    }

    revalidatePath("/");
    if (isFetchRequest(request)) {
      return jsonStatus("message-deleted");
    }
    return redirectWithStatus(request, "message-deleted", bot, chat);
  } catch (error) {
    console.error(error);
    if (isFetchRequest(request)) {
      return jsonStatus("delete-error", 500);
    }
    return redirectWithStatus(request, "delete-error", bot, chat);
  }
}
