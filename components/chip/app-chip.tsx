"use client";

import type { ComponentProps, ReactNode } from "react";

import { useRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsTruncated } from "@/core/utils/use-is-truncated";
import { cn } from "@/core/utils/cn";

const chipVariants = cva("", {
  variants: {
    size: {
      sm: "px-1.5 py-0.5 text-[11px] h-[22px] [&>svg]:size-3",
      md: "px-2 py-0.5 text-xs h-[26px] [&>svg]:size-3.5",
      lg: "px-2.5 py-0.5 text-sm h-[30px] [&>svg]:size-4",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

type Props = Omit<ComponentProps<typeof Badge>, "children"> & {
  children: ReactNode;
  startContent?: ReactNode;
  endContent?: ReactNode;
  tooltip?: ReactNode;
  focusableTooltip?: boolean;
} & VariantProps<typeof chipVariants>;

export function AppChip({
  children,
  className,
  variant = "secondary",
  size = "sm",
  startContent,
  endContent,
  tooltip,
  focusableTooltip = false,
  interactive,
  tabIndex,
  ...props
}: Props) {
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const isTruncated = useIsTruncated(labelRef, children);
  const showTooltip = tooltip != null || (isTruncated && typeof children === "string");
  const keyboardTooltipTabIndex = focusableTooltip && !interactive && isTruncated && showTooltip ? 0 : undefined;

  const chip = (
    <Badge
      className={cn("rounded-md shrink min-w-0 w-auto max-w-full", chipVariants({ size }), className)}
      interactive={interactive}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a truncated, noninteractive chip needs a keyboard focus target for its tooltip
      tabIndex={tabIndex ?? keyboardTooltipTabIndex}
      variant={variant}
      {...props}
    >
      {startContent}

      <span ref={labelRef} className="truncate min-w-0">
        {children}
      </span>

      {endContent}
    </Badge>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{chip}</TooltipTrigger>

        {showTooltip && <TooltipContent className="max-w-xs">{tooltip ?? children}</TooltipContent>}
      </Tooltip>
    </TooltipProvider>
  );
}
