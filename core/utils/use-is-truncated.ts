"use client";

import type { RefObject } from "react";

import { useEffect, useState } from "react";

export function useIsTruncated(ref: RefObject<HTMLElement | null>, dependency?: unknown) {
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => setIsTruncated(el.scrollWidth > el.clientWidth + 1);
    update();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, dependency]);

  return isTruncated;
}
