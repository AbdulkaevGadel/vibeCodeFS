const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const forgotPasswordSuccessMessage =
  "Если аккаунт с таким email существует, мы отправили письмо для сброса пароля.";

const forgotPasswordFallbackMessage =
  "Не удалось отправить письмо для восстановления. Попробуйте позже.";
const forgotPasswordRateLimitMessage =
  "Слишком много запросов на восстановление пароля. Попробуйте позже.";

type ForgotPasswordErrorLike = {
  message?: string;
  status?: number;
  code?: string;
};

export type ForgotPasswordLogErrorDetails =
  | {
      message: string;
      name: string;
    }
  | "Unknown error";

export function normalizeForgotPasswordEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateForgotPasswordEmail(rawEmail: string) {
  const normalizedEmail = normalizeForgotPasswordEmail(rawEmail);

  if (!normalizedEmail) {
    return "Введите email.";
  }

  if (!emailPattern.test(normalizedEmail)) {
    return "Введите корректный email.";
  }

  return null;
}

export function mapForgotPasswordError(error: ForgotPasswordErrorLike) {
  if (isRateLimitError(error)) {
    return forgotPasswordRateLimitMessage;
  }

  return forgotPasswordFallbackMessage;
}

export function getForgotPasswordLogErrorDetails(
  error: unknown,
): ForgotPasswordLogErrorDetails {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }

  return "Unknown error";
}

export function getForgotPasswordErrorLike(error: unknown): ForgotPasswordErrorLike {
  return error instanceof Error ? { message: error.message } : {};
}

function isRateLimitError(error: ForgotPasswordErrorLike) {
  const normalizedMessage = error.message?.toLowerCase() ?? "";
  const normalizedCode = error.code?.toLowerCase() ?? "";

  return (
    error.status === 429 ||
    normalizedCode.includes("over_email_send_rate_limit") ||
    normalizedCode.includes("too_many_requests") ||
    normalizedMessage.includes("too many requests") ||
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("over_email_send_rate_limit")
  );
}
