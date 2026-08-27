"use client";

import { useRef } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsTruncated } from "@/core/utils/use-is-truncated";
import { cn } from "@/core/utils/cn";

type Props = {
  children: string;
  className?: string;
  suppressHydrationWarning?: boolean;
};

export function TruncatedText({ children, className, suppressHydrationWarning }: Props) {
  const textRef = useRef<HTMLSpanElement | null>(null);
  const isTruncated = useIsTruncated(textRef, children);

  const content = (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- an overflowing tooltip needs a keyboard focus target without implying button semantics
    <span className={cn("flex min-w-0", className)} tabIndex={isTruncated ? 0 : undefined}>
      <span ref={textRef} className="truncate min-w-0 flex-1" suppressHydrationWarning={suppressHydrationWarning}>
        {children}
      </span>
    </span>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>

        {isTruncated ? <TooltipContent className="max-w-xs">{children}</TooltipContent> : null}
      </Tooltip>
    </TooltipProvider>
  );
}
