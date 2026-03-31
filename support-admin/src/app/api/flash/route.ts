import { NextResponse } from "next/server";
import { flashCookieName } from "@/app/_lib/flash-cookie";

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(flashCookieName, "", {
    expires: new Date(0),
    path: "/",
  });

  return response;
}
