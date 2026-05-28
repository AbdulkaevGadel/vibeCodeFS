import type { User } from "@supabase/supabase-js";
type ResetPasswordSearchParams = {
  error?: string | string[];
};

export type ResetPasswordPageData = {
  hasRecoveryError: boolean;
  hasUserSession: boolean;
};

export function getResetPasswordPageData(
  params: ResetPasswordSearchParams,
  user: User | null,
): ResetPasswordPageData {
  const hasRecoveryError =
    (typeof params.error === "string" && params.error.length > 0) ||
    Array.isArray(params.error);

  return {
    hasRecoveryError,
    hasUserSession: Boolean(user),
  };
}
