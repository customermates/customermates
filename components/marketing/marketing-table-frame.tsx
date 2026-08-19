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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);

    return () => observer.disconnect();
  }, []);

  return (
    <div className={cn("relative overflow-clip rounded-xl border border-border bg-card shadow-xs", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden dark:block"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 0% 0%, rgba(94,74,227,0.08), transparent 60%), radial-gradient(ellipse 70% 60% at 100% 100%, rgba(18,148,144,0.06), transparent 60%)",
        }}
      />

      <div
        ref={scrollRef}
        className={cn("relative", overflowing ? "overflow-x-auto" : "overflow-x-clip")}
        style={overflowing ? ({ "--table-sticky-top": "0px" } as CSSProperties) : undefined}
      >
        {children}
      </div>
    </div>
  );
}
