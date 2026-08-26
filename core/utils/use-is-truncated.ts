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

    const frame = typeof requestAnimationFrame === "undefined" ? undefined : requestAnimationFrame(update);
    const fallbackTimer = frame === undefined && typeof setTimeout !== "undefined" ? setTimeout(update, 0) : undefined;

    const cleanupScheduledUpdate = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (fallbackTimer !== undefined) clearTimeout(fallbackTimer);
    };

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);

      return () => {
        cleanupScheduledUpdate();
        window.removeEventListener("resize", update);
      };
    }

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      cleanupScheduledUpdate();
      observer.disconnect();
    };
  }, [ref, dependency]);

  return isTruncated;
}
