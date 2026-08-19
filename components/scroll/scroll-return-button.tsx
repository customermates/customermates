"use client";

import { ArrowDown, ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
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
    <Button
      aria-label={label}
      className={cn(
        "absolute left-1/2 z-20 h-8 -translate-x-1/2 gap-1.5 rounded-full border bg-background/95 px-3 text-xs shadow-md backdrop-blur",
        direction === "bottom" ? "bottom-3" : "top-3",
        className,
      )}
      size="sm"
      type="button"
      variant="secondary"
      onClick={onReturn}
    >
      <Icon aria-hidden="true" className="size-3.5" />

      {label}
    </Button>
  );
}
