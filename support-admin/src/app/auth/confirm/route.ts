import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const defaultNextPath = "/reset-password";

function getSafeNextPath(next: string | null) {
  if (!next || !next.startsWith("/")) {
    return defaultNextPath;
  }

  return next;
}

function createRedirectUrl(request: NextRequest, pathname: string, error?: string) {
  const redirectUrl = request.nextUrl.clone();

  redirectUrl.pathname = pathname;
  redirectUrl.search = "";
  redirectUrl.hash = "";

  if (error) {
    redirectUrl.searchParams.set("error", error);
  }

  return redirectUrl;
}

function createDebugRedirectUrl(
  request: NextRequest,
  pathname: string,
  debugStage: string,
  error?: string,
) {
  const redirectUrl = createRedirectUrl(request, pathname, error);

  redirectUrl.searchParams.set("debug", debugStage);

  return redirectUrl;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextPath = getSafeNextPath(searchParams.get("next"));

  const successRedirectUrl = createDebugRedirectUrl(
    request,
    nextPath,
    "confirm_verified",
  );
  const errorRedirectUrl = createDebugRedirectUrl(
    request,
    defaultNextPath,
    "confirm_failed",
    "recovery_invalid",
  );

  if (!tokenHash || !type) {
    return NextResponse.redirect(
      createDebugRedirectUrl(
        request,
        defaultNextPath,
        "confirm_missing_token",
        "recovery_invalid",
      ),
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    return NextResponse.redirect(errorRedirectUrl);
  }

  return NextResponse.redirect(successRedirectUrl);
}
