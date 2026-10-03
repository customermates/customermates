"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type FocusRequest = {
  container: () => Element | null;
  selector: string;
  index: number;
  fallback: () => HTMLElement | null;
};

function focusLost() {
  const active = document.activeElement;
  return !active || active === document.body || !active.isConnected;
}

export function useFocusAfterRemoval() {
  const pending = useRef<FocusRequest | null>(null);
  const [request, setRequest] = useState(0);
  useEffect(() => {
    const next = pending.current;
    pending.current = null;
    if (!next || !focusLost()) return;
    const items = Array.from(next.container()?.querySelectorAll<HTMLElement>(next.selector) ?? []).filter(
      (element) => element.isConnected && !element.matches(":disabled"),
    );
    const target = items[Math.min(next.index, items.length - 1)] ?? next.fallback();
    target?.focus({ preventScroll: true });
  }, [request]);
  return useCallback((next: FocusRequest) => {
    pending.current = next;
    setRequest((value) => value + 1);
  }, []);
}
