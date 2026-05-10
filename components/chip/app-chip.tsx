"use client";

import type { ComponentProps, ReactNode } from "react";

import { useEffect, useRef, useState } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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
} & VariantProps<typeof chipVariants>;

export function AppChip({
  children,
  className,
  variant = "secondary",
  size = "sm",
  startContent,
  endContent,
  ...props
}: Props) {
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = labelRef.current;
    if (!el) return;

    const update = () => setIsTruncated(el.scrollWidth > el.clientWidth + 1);
    update();

    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  const chip = (
    <Badge
      className={cn("rounded-md shrink min-w-0 w-auto max-w-full", chipVariants({ size }), className)}
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

  const showTooltip = isTruncated && typeof children === "string";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{chip}</TooltipTrigger>

        {showTooltip && <TooltipContent>{children}</TooltipContent>}
      </Tooltip>
    </TooltipProvider>
  );
}
