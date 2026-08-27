"use client";

import { useEffect, useRef, useState } from "react";

export const STEADY_LABEL_MIN_MS = 700;

export function steadyLabelDelay(shownAt: number, now: number, minMs: number) {
  return Math.max(0, shownAt + minMs - now);
}

export function useSteadyLabel(label: string, minMs: number = STEADY_LABEL_MIN_MS) {
  const [shown, setShown] = useState(label);
  const shownAt = useRef(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (label === shown) return;

    const show = () => {
      shownAt.current = Date.now();
      setShown(label);
    };

    const delay = steadyLabelDelay(shownAt.current, Date.now(), minMs);
    if (delay === 0) {
      show();
      return;
    }

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(show, delay);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [label, minMs, shown]);

  return shown;
}
