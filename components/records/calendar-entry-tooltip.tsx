"use client";

import type { ReactElement } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function CalendarEntryTooltip({
  children,
  name,
  date,
  source,
}: {
  children: ReactElement;
  name: string;
  date: string;
  source?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>

      <TooltipContent className="max-w-xs space-y-1 wrap-anywhere">
        <span className="block font-medium">{name}</span>

        <span className="block">{date}</span>

        {source && <span className="block text-muted-foreground">{source}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
