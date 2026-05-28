const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginLogErrorDetails =
  | {
      message: string;
      name: string;
    }
  | "Unknown error";

export function normalizeLoginEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateLoginInput(
  rawEmail: string,
  password: string,
): string | null {
  const normalizedEmail = normalizeLoginEmail(rawEmail);

  if (!normalizedEmail) {
    return "Введите email.";
  }

  if (!emailPattern.test(normalizedEmail)) {
    return "Введите корректный email.";
  }

  if (!password.trim()) {
    return "Введите пароль.";
  }

  return null;
}

export function mapLoginError(message?: string) {
  if (!message) {
    return "Не удалось выполнить вход. Попробуйте позже.";
  }

  if (message === "Invalid login credentials") {
    return "Неверный email или пароль.";
  }

  return "Не удалось выполнить вход. Попробуйте позже.";
}

export function getLoginLogErrorDetails(error: unknown): LoginLogErrorDetails {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }

  return "Unknown error";
}
