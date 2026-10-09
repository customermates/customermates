"use client";

import type { MouseEvent, ReactNode } from "react";

import { MousePointerClick } from "lucide-react";

import { cn } from "@/core/utils/cn";

import { type HomepageStageArea, PRODUCT_DEMO_ANCHOR, STAGE_OPEN_EVENT } from "./homepage-stage-areas";

type Props = {
  area: HomepageStageArea;
  children: ReactNode;
  className?: string;
  label: string;
};

export function HomepageStageLink({ area, children, className, label }: Props) {
  function openStage(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    window.dispatchEvent(new CustomEvent<HomepageStageArea>(STAGE_OPEN_EVENT, { detail: area }));
  }

  return (
    <a
      className={cn(
        "group relative block rounded-[inherit] outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
        className,
      )}
      data-homepage-stage-link={area}
      href={`#${PRODUCT_DEMO_ANCHOR}`}
      onClick={openStage}
    >
      {children}

      <span className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none max-sm:hidden">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/90 px-4 py-2 text-sm font-medium text-foreground shadow-lg backdrop-blur-md">
          <MousePointerClick aria-hidden className="size-4" strokeWidth={1.75} />

          {label}
        </span>
      </span>
    </a>
  );
}
