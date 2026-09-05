"use client";

import type { KeyboardEventHandler, MouseEventHandler, ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/core/utils/cn";

export const VIEW_TAB_CLASS =
  "inline-flex h-7 max-w-36 flex-none items-center rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap sm:max-w-56";

type Props = {
  href: string;
  id?: string;
  isActive: boolean;
  label: string;
  preview: ReactNode;
  tabIndex: 0 | -1;
  onKeyDown?: KeyboardEventHandler<HTMLAnchorElement>;
  onSelect?: MouseEventHandler<HTMLAnchorElement>;
};

export function ViewChip({ href, id, isActive, label, preview, tabIndex, onKeyDown, onSelect }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          aria-current={isActive ? "page" : undefined}
          className={cn(
            VIEW_TAB_CLASS,
            "outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none",
            isActive ? "bg-foreground/10 text-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
          )}
          data-view-chip=""
          href={href}
          id={id}
          tabIndex={tabIndex}
          onClick={onSelect}
          onKeyDown={onKeyDown}
        >
          <span className="truncate">{label}</span>
        </a>
      </TooltipTrigger>

      <TooltipContent className="max-w-xs">{preview}</TooltipContent>
    </Tooltip>
  );
}
