import type { User } from "@supabase/supabase-js";
import type { AuthError } from "@supabase/supabase-js";

type ResetPasswordSearchParams = {
  error?: string | string[];
};

export type ResetPasswordPageData = {
  hasRecoveryError: boolean;
  hasUserSession: boolean;
  debugItems: string[];
};

export function getResetPasswordPageData(
  params: ResetPasswordSearchParams,
  user: User | null,
  error: AuthError | null,
): ResetPasswordPageData {
  const hasRecoveryError =
    (typeof params.error === "string" && params.error.length > 0) ||
    Array.isArray(params.error);

  return {
    hasRecoveryError,
    hasUserSession: Boolean(user),
    debugItems: [
      `session.user=${user ? "present" : "missing"}`,
      `session.userId=${user?.id ?? "none"}`,
      `auth.errorMessage=${error?.message ?? "none"}`,
      `auth.errorStatus=${
        error && "status" in error ? String(error.status ?? "none") : "none"
      }`,
      `auth.errorCode=${
        error && "code" in error ? String(error.code ?? "none") : "none"
      }`,
      `recovery.errorParam=${hasRecoveryError ? "present" : "none"}`,
    ],
  };
}
