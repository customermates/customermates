"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { cn } from "@/core/utils/cn";
import { OVERLAY_COLLISION_PADDING, OVERLAY_HEADER_ALIGNMENT_CLASS } from "./overlay-contract";

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  collisionPadding = OVERLAY_COLLISION_PADDING,
  onOpenAutoFocus,
  portalled = true,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & { portalled?: boolean }) {
  const content = (
    <PopoverPrimitive.Content
      align={align}
      className={cn(
        "z-50 max-h-(--radix-popover-content-available-height) w-72 max-w-(--radix-popover-content-available-width) origin-(--radix-popover-content-transform-origin) overflow-y-auto overscroll-contain rounded-md border border-border-strong bg-popover p-4 text-popover-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
        className,
      )}
      collisionPadding={collisionPadding}
      data-slot="popover-content"
      sideOffset={sideOffset}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        onOpenAutoFocus?.(event);
      }}
      {...props}
    />
  );

  return portalled ? <PopoverPrimitive.Portal>{content}</PopoverPrimitive.Portal> : content;
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1 text-sm", OVERLAY_HEADER_ALIGNMENT_CLASS, className)}
      data-slot="popover-header"
      {...props}
    />
  );
}

function PopoverFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex shrink-0 flex-wrap items-center justify-end gap-2", className)}
      data-slot="popover-footer"
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <div className={cn("font-medium", className)} data-slot="popover-title" {...props} />;
}

function PopoverDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-muted-foreground", className)} data-slot="popover-description" {...props} />;
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverHeader,
  PopoverFooter,
  PopoverTitle,
  PopoverDescription,
};
