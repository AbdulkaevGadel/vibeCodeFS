"use client";

import { RefObject, useEffect } from "react";

export function useScrollToBottom(targetRef: RefObject<HTMLElement | null>, dependency: unknown) {
  useEffect(() => {
    targetRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dependency, targetRef]);
}
