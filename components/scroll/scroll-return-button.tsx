"use client";

import { ArrowDown, ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/core/utils/cn";

import type { ScrollReturnDirection } from "./use-scroll-return";

type Props = {
  className?: string;
  direction: ScrollReturnDirection;
  isAway: boolean;
  label: string;
  onReturn: () => void;
};

export function ScrollReturnButton({ className, direction, isAway, label, onReturn }: Props) {
  if (!isAway) return null;

  const Icon = direction === "bottom" ? ArrowDown : ArrowUp;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={label}
            className={cn(
              "absolute right-3 bottom-3 z-20 size-8 rounded-full border bg-background/95 text-muted-foreground shadow-md backdrop-blur",
              className,
            )}
            size="icon"
            type="button"
            variant="secondary"
            onClick={onReturn}
          >
            <Icon aria-hidden="true" className="size-3.5" />
          </Button>
        </TooltipTrigger>

        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
