"use client";

import type { CSSProperties, ReactNode } from "react";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/core/utils/cn";

type Props = {
  className?: string;
  children: ReactNode;
};

export function MarketingTableFrame({ className, children }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const measure = () => {
      setOverflowing(el.scrollWidth > el.clientWidth + 1);
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    el.addEventListener("scroll", measure, { passive: true });

    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, []);

  return (
    <div className={cn("relative overflow-clip rounded-xl border border-border bg-card", className)}>
      <div
        ref={scrollRef}
        className={cn("relative", overflowing ? "overflow-x-auto" : "overflow-x-clip")}
        style={overflowing ? ({ "--table-sticky-top": "0px" } as CSSProperties) : undefined}
      >
        {children}
      </div>

      {overflowing && !atEnd ? (
        <div
          aria-hidden
          data-table-scroll-hint
          className="pointer-events-none absolute inset-y-0 right-0 z-20 w-10 bg-gradient-to-l from-card to-transparent"
        />
      ) : null}
    </div>
  );
}
