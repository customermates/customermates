"use client";

import { useCallback, useEffect, useState } from "react";

export type ScrollReturnDirection = "top" | "bottom";

export const SCROLL_RETURN_THRESHOLD = 120;

type ScrollElementSource = () => HTMLElement | null;

function distanceFromAnchor(element: HTMLElement, direction: ScrollReturnDirection) {
  return direction === "bottom" ? element.scrollHeight - element.scrollTop - element.clientHeight : element.scrollTop;
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const SCROLL_SETTLE_CHECK_MS = 150;

export function scrollToAnchor(element: HTMLElement, direction: ScrollReturnDirection) {
  const target = direction === "bottom" ? element.scrollHeight : 0;
  const origin = element.scrollTop;

  if (prefersReducedMotion()) {
    element.scrollTop = target;
    return;
  }

  element.scrollTo({ behavior: "smooth", top: target });
  window.setTimeout(() => {
    if (element.scrollTop === origin && origin !== target) element.scrollTop = target;
  }, SCROLL_SETTLE_CHECK_MS);
}

export function useScrollReturn(args: {
  getScrollElement: ScrollElementSource;
  direction: ScrollReturnDirection;
  threshold?: number;
  enabled?: boolean;
}) {
  const { getScrollElement, direction, threshold = SCROLL_RETURN_THRESHOLD, enabled = true } = args;
  const [isAway, setIsAway] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsAway(false);
      return;
    }

    let element: HTMLElement | null = null;

    const sync = () => {
      const next = getScrollElement();
      if (next !== element) {
        element?.removeEventListener("scroll", sync);
        element = next;
        element?.addEventListener("scroll", sync, { passive: true });
      }
      setIsAway(Boolean(element) && distanceFromAnchor(element as HTMLElement, direction) > threshold);
    };

    sync();
    window.addEventListener("resize", sync);
    const interval = window.setInterval(sync, 500);

    return () => {
      element?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.clearInterval(interval);
    };
  }, [direction, enabled, getScrollElement, threshold]);

  const returnToAnchor = useCallback(() => {
    const element = getScrollElement();
    if (!element) return;

    scrollToAnchor(element, direction);
    setIsAway(false);
    requestAnimationFrame(() => element.focus({ preventScroll: true }));
  }, [direction, getScrollElement]);

  return { isAway, returnToAnchor };
}
