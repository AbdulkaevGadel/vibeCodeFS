export function getCreateAuthUserErrorMessage(error: { message?: string; code?: string } | null) {
  const errorMessage = error?.message?.toLowerCase() ?? "";
  const errorCode = error?.code?.toLowerCase() ?? "";

  if (
    errorCode.includes("email_exists") ||
    errorMessage.includes("already registered") ||
    errorMessage.includes("already exists") ||
    errorMessage.includes("user already")
  ) {
    return "Пользователь с такой почтой уже существует в Supabase Auth. Если это незавершённый аккаунт, удалите его в Supabase и попробуйте снова.";
  }

  if (errorMessage.includes("password")) {
    return "Пароль не прошёл проверку Supabase Auth. Укажите другой пароль.";
  }

  if (errorMessage.includes("email")) {
    return "Supabase Auth отклонил email. Проверьте адрес и попробуйте снова.";
  }

  return "Не удалось создать пользователя в Supabase Auth.";
}
