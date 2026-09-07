"use client";

import type { KeyboardEventHandler, MouseEventHandler, ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/core/utils/cn";

export const VIEW_SURFACE_CLASS =
  "border border-border bg-secondary text-muted-foreground shadow-xs hover:bg-accent hover:text-foreground";

export const VIEW_TAB_CLASS = cn(
  buttonVariants({ variant: "ghost", size: "sm" }),
  "h-7 max-w-36 flex-none rounded-full px-2.5 text-xs font-medium sm:max-w-56",
  VIEW_SURFACE_CLASS,
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
            isActive &&
              "border-primary/40 bg-primary/20 text-primary-soft-foreground hover:bg-primary/20 hover:text-primary-soft-foreground",
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
