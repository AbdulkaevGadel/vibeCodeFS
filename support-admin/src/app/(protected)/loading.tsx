import { LoadingScreen } from "@/shared/ui/loading";

export default function ProtectedLoading() {
  return (
    <LoadingScreen
      title="Открываем админку"
      description="Проверяем доступ и подготавливаем данные панели."
    />
  );
}
