import { LoadingScreen } from "@/shared/ui/loading";

export default function LoginLoading() {
  return (
    <LoadingScreen
      title="Открываем вход"
      description="Проверяем сессию и готовим страницу входа."
    />
  );
}
