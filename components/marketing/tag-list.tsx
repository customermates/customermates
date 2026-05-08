"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { AppChip } from "@/components/chip/app-chip";

export type TagListProps = {
  tags: string[];
  variant?: "default" | "secondary";
};

const GAP_PX = 8;

export function TagList({ tags, variant = "default" }: TagListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLSpanElement>(null);
  const [visibleCount, setVisibleCount] = useState(tags.length);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node || tags.length === 0) return;

    const recalc = () => {
      const containerWidth = node.clientWidth;
      if (containerWidth === 0) return;

      const chips = Array.from(node.querySelectorAll<HTMLElement>("[data-tag-idx]"));
      const overflowWidth = overflowRef.current?.offsetWidth ?? 44;

      let used = 0;
      let count = 0;

      for (let i = 0; i < tags.length; i++) {
        const chipWidth = chips[i]?.offsetWidth ?? 0;
        const widthNeeded = chipWidth + (i > 0 ? GAP_PX : 0);
        const isLast = i === tags.length - 1;
        const reservedForOverflow = isLast ? 0 : overflowWidth + GAP_PX;

        if (used + widthNeeded + reservedForOverflow > containerWidth) break;

        used += widthNeeded;
        count = i + 1;
      }

      setVisibleCount(count);
    };

    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(node);
    return () => ro.disconnect();
  }, [tags]);

  if (tags.length === 0) return null;

  const overflowCount = Math.max(0, tags.length - visibleCount);

  return (
    <div ref={containerRef} className="relative flex min-w-0 flex-nowrap gap-2 overflow-hidden">
      {tags.map((tag, i) => {
        const isVisible = i < visibleCount;
        return (
          <span
            key={tag}
            className={isVisible ? "shrink-0" : "pointer-events-none invisible absolute"}
            data-tag-idx={i}
          >
            <AppChip variant={variant}>{tag}</AppChip>
          </span>
        );
      })}

      <span ref={overflowRef} className={overflowCount > 0 ? "shrink-0" : "pointer-events-none invisible absolute"}>
        <AppChip variant={variant}>+{overflowCount > 0 ? overflowCount : tags.length}</AppChip>
      </span>
    </div>
  );
}
