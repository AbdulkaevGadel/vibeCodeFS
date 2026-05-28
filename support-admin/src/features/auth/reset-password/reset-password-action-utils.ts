const minimumPasswordLength = 8;

export type ResetPasswordLogErrorDetails = {
  message: string;
  name: string;
  stack: string;
};

export function validateResetPassword(password: string) {
  if (!password.trim()) {
    return "Введите новый пароль.";
  }

  if (password.length < minimumPasswordLength) {
    return `Пароль должен быть не короче ${minimumPasswordLength} символов.`;
  }

  return null;
}

export function mapResetPasswordError(message?: string) {
  if (!message) {
    return "Не удалось обновить пароль. Попробуйте снова.";
  }

  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("auth session missing") ||
    normalizedMessage.includes("session not found") ||
    normalizedMessage.includes("invalid claim") ||
    normalizedMessage.includes("jwt")
  ) {
    return "Ссылка для сброса пароля недействительна или устарела. Запросите новую.";
  }

  return "Не удалось обновить пароль. Попробуйте снова.";
}

export function getResetPasswordLogErrorDetails(
  error: unknown,
): ResetPasswordLogErrorDetails {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack ?? "none",
    };
  }

  return {
    message: String(error),
    name: "Unknown error",
    stack: "none",
  };
}
