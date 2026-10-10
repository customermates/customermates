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

export const VIEW_TAB_ACTIVE_CLASS =
  "border-primary/40 bg-primary/20 text-primary-soft-foreground hover:bg-primary/20 hover:text-primary-soft-foreground";

type Props = {
  href: string;
  id?: string;
  isActive: boolean;
  isModified?: boolean;
  label: string;
  modifiedLabel?: string;
  preview: ReactNode;
  tabIndex: 0 | -1;
  onKeyDown?: KeyboardEventHandler<HTMLAnchorElement>;
  onSelect?: MouseEventHandler<HTMLAnchorElement>;
  focusKey?: string;
};

export function ViewChip({
  href,
  id,
  isActive,
  isModified = false,
  label,
  modifiedLabel,
  preview,
  tabIndex,
  onKeyDown,
  onSelect,
  focusKey,
}: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          aria-current={isActive ? "page" : undefined}
          className={cn(VIEW_TAB_CLASS, "relative", isActive && VIEW_TAB_ACTIVE_CLASS)}
          data-focus-target={focusKey}
          data-view-chip=""
          data-view-modified={isModified ? "" : undefined}
          href={href}
          id={id}
          tabIndex={tabIndex}
          onClick={onSelect}
          onKeyDown={onKeyDown}
        >
          <span className="truncate">{label}</span>

          {isModified && (
            <>
              <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />

              <span className="sr-only">{modifiedLabel}</span>
            </>
          )}
        </a>
      </TooltipTrigger>

      <TooltipContent className="max-w-xs">{preview}</TooltipContent>
    </Tooltip>
  );
}
