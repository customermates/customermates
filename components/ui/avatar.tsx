"use client";

import * as React from "react";
import { Avatar as AvatarPrimitive } from "radix-ui";

import { cn } from "@/core/utils/cn";
import { initialsFor, personInitials } from "@/core/utils/initials";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function Avatar({
  className,
  size = "default",
  src,
  name,
  fallback,
  unlinked,
  unlinkedLabel,
  title,
  children,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & {
  size?: "default" | "sm" | "lg" | "xl";
  src?: string | null;
  name?: string | (string | null | undefined)[];
  fallback?: React.ReactNode;
  unlinked?: boolean;
  unlinkedLabel?: string;
}) {
  const resolvedFallback =
    name != null ? (Array.isArray(name) ? personInitials(name[0], name[1]) : initialsFor(name)) : fallback;

  const root = (
    <AvatarPrimitive.Root
      className={cn(
        "group/avatar relative flex size-6 shrink-0 overflow-hidden rounded-md select-none data-[size=lg]:size-8 data-[size=lg]:rounded-lg data-[size=sm]:size-4 data-[size=sm]:rounded data-[size=xl]:size-16 data-[size=xl]:rounded-lg",
        unlinked &&
          "outline-dashed outline-primary outline-[1.5px] -outline-offset-[1.5px] data-[size=sm]:outline-[1px] data-[size=sm]:-outline-offset-[1px] data-[size=lg]:outline-[2px] data-[size=lg]:-outline-offset-[2px]",
        className,
      )}
      data-size={size}
      data-slot="avatar"
      {...props}
    >
      {children ?? (
        <>
          {src && <AvatarImage src={src} />}

          {resolvedFallback != null && <AvatarFallback>{resolvedFallback}</AvatarFallback>}
        </>
      )}
    </AvatarPrimitive.Root>
  );

  const tooltipLabel = unlinked && unlinkedLabel ? unlinkedLabel : title;

  if (!tooltipLabel) return root;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{root}</TooltipTrigger>

        <TooltipContent className="whitespace-pre-line">{tooltipLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function AvatarImage({ className, alt = "", ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      alt={alt}
      className={cn("aspect-square size-full", className)}
      data-slot="avatar-image"
      {...props}
    />
  );
}

function AvatarFallback({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      className={cn(
        "flex size-full items-center justify-center rounded-[inherit] bg-foreground/10 text-[11px] font-medium text-foreground/70 group-data-[size=sm]/avatar:text-[8px] group-data-[size=lg]/avatar:text-sm group-data-[size=xl]/avatar:text-lg",
        className,
      )}
      data-slot="avatar-fallback"
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
