"use client";

import { useRef } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsTruncated } from "@/core/utils/use-is-truncated";
import { cn } from "@/core/utils/cn";

type Props = {
  children: string;
  className?: string;
};

export function TruncatedText({ children, className }: Props) {
  const textRef = useRef<HTMLSpanElement | null>(null);
  const isTruncated = useIsTruncated(textRef, children);

  const content = (
    <span className={cn("flex min-w-0", className)}>
      <span ref={textRef} className="truncate min-w-0">
        {children}
      </span>
    </span>
  );

  if (!isTruncated) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>

      <TooltipContent className="max-w-xs">{children}</TooltipContent>
    </Tooltip>
  );
}
