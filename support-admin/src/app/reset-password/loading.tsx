import { LoadingScreen } from "@/shared/ui/loading";

export default function ResetPasswordLoading() {
  return (
    <LoadingScreen
      title="Готовим восстановление"
      description="Проверяем сессию и подготавливаем форму смены пароля."
    />
  );
}
