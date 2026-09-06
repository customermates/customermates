"use client";

import type { KeyboardEventHandler, MouseEventHandler, ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/core/utils/cn";

export const VIEW_TAB_CLASS = cn(
  buttonVariants({ variant: "ghost", size: "sm" }),
  "h-7 max-w-36 flex-none rounded-full px-2.5 text-xs font-medium sm:max-w-56",
  "border border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
);

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
            isActive && "border-border-strong bg-selected text-foreground hover:bg-selected",
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
