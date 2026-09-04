"use client";

import type { ReactNode } from "react";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/core/utils/cn";

type Props = {
  ariaLabel: string;
  bleed?: boolean;
  children: ReactNode;
  className?: string;
  focusable?: boolean;
  observedKey?: unknown;
  overflowAttribute?: string;
  railClassName?: string;
  railProps?: Record<string, string>;
  regionProps?: Record<string, string>;
};

export function OverflowRail({
  ariaLabel,
  bleed = true,
  children,
  className,
  focusable = true,
  observedKey,
  overflowAttribute = "data-overflow-rail-overflow",
  railClassName,
  railProps,
  regionProps,
}: Props) {
  const scrollRegionRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const updateOverflow = useCallback(() => {
    const scrollRegion = scrollRegionRef.current;
    setIsOverflowing(Boolean(scrollRegion && scrollRegion.scrollWidth > scrollRegion.clientWidth));
  }, []);

  useEffect(() => {
    const scrollRegion = scrollRegionRef.current;
    if (!scrollRegion) return;

    updateOverflow();
    window.addEventListener("resize", updateOverflow);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            updateOverflow();
          });
    resizeObserver?.observe(scrollRegion);
    if (scrollRegion.firstElementChild) resizeObserver?.observe(scrollRegion.firstElementChild);

    return () => {
      window.removeEventListener("resize", updateOverflow);
      resizeObserver?.disconnect();
    };
  }, [observedKey, updateOverflow]);

  const isRegion = focusable && isOverflowing;

  return (
    <div
      ref={scrollRegionRef}
      {...regionProps}
      aria-label={isRegion ? ariaLabel : undefined}
      className={cn(
        "overflow-x-auto focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        bleed && "-mx-4 px-4",
        className,
      )}
      role={isRegion ? "region" : undefined}
      tabIndex={isRegion ? 0 : undefined}
      {...{ [overflowAttribute]: isOverflowing || undefined }}
    >
      <div {...railProps} className={cn("flex w-max min-w-full items-stretch", railClassName)}>
        {children}
      </div>
    </div>
  );
}
