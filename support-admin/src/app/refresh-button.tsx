"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "./_components/ui/button";

export function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
      isLoading={isPending}
    >
      {isPending ? "Обновляю..." : "Обновить"}
    </Button>
  );
}
