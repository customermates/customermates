"use client";

import * as React from "react";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";

import { cn } from "@/core/utils/cn";
import { MenuSurface } from "./menu-surface";
import { OVERLAY_COLLISION_PADDING } from "./overlay-contract";

function ContextMenu({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

function ContextMenuTrigger({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  return <ContextMenuPrimitive.Trigger {...props} />;
}

function ContextMenuContent({
  className,
  children,
  collisionPadding = OVERLAY_COLLISION_PADDING,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        className={cn(
          "z-50 max-h-(--radix-context-menu-content-available-height) min-w-32 max-w-(--radix-context-menu-content-available-width) origin-(--radix-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto overscroll-contain rounded-md border border-border-strong bg-popover p-1 text-popover-foreground shadow-md data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        collisionPadding={collisionPadding}
        data-slot="context-menu-content"
        {...props}
      >
        <MenuSurface value="context">{children}</MenuSurface>
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  );
}

export { ContextMenu, ContextMenuTrigger, ContextMenuContent };
