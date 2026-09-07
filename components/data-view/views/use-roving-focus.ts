"use client";

import type { KeyboardEvent, KeyboardEventHandler } from "react";

import { useCallback } from "react";

const RAIL_SELECTOR = "[data-data-view-rail-items]";
const CHIP_SELECTOR = "a[data-view-chip]";

function targetIndex(key: string, index: number, count: number): number | null {
  switch (key) {
    case "ArrowLeft":
      return index > 0 ? index - 1 : null;
    case "ArrowRight":
      return index < count - 1 ? index + 1 : null;
    case "Home":
      return index > 0 ? 0 : null;
    case "End":
      return index < count - 1 ? count - 1 : null;
    default:
      return null;
  }
}

export function useRovingFocus(
  count: number,
  activeIndex: number,
): {
  onKeyDownAt: (index: number) => KeyboardEventHandler<HTMLAnchorElement>;
  tabIndexAt: (index: number) => 0 | -1;
} {
  const tabIndexAt = useCallback((index: number): 0 | -1 => (index === activeIndex ? 0 : -1), [activeIndex]);

  const onKeyDownAt = useCallback(
    (index: number): KeyboardEventHandler<HTMLAnchorElement> =>
      (event: KeyboardEvent<HTMLAnchorElement>) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

        const next = targetIndex(event.key, index, count);
        if (next === null) return;

        const chips = event.currentTarget.closest(RAIL_SELECTOR)?.querySelectorAll<HTMLElement>(CHIP_SELECTOR);
        const chip = chips?.[next];
        if (!chip) return;

        event.preventDefault();
        chip.focus();
        chip.scrollIntoView({ block: "nearest", inline: "nearest" });
      },
    [count],
  );

  return { onKeyDownAt, tabIndexAt };
}
