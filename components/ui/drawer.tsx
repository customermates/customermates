"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { useTranslations } from "next-intl";

import { XIcon } from "lucide-react";

import { cn } from "@/core/utils/cn";
import {
  OVERLAY_CLOSE_CLASS,
  OVERLAY_CLOSE_POSITION_CLASS,
  OVERLAY_HEADER_ALIGNMENT_CLASS,
  OVERLAY_SCROLL_REGION,
} from "./overlay-contract";

function Drawer({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

function DrawerTrigger({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      data-slot="drawer-overlay"
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  const t = useTranslations();

  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />

      <DrawerPrimitive.Content
        className={cn(
          "group/drawer-content fixed z-50 flex h-auto flex-col overflow-hidden bg-background",
          "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-(--sheet-block-budget) data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b",
          "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-(--sheet-block-budget) data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t",
          "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm",
          "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm",
          className,
        )}
        data-overlay-close={showCloseButton ? "" : undefined}
        data-overlay-surface="drawer"
        data-slot="drawer-content"
        {...props}
      >
        <div className="mx-auto mt-4 hidden h-2 w-[100px] shrink-0 rounded-full bg-border-strong group-data-[vaul-drawer-direction=bottom]/drawer-content:block group-data-[overlay-actions]/drawer-content:hidden!" />

        {children}

        {showCloseButton && (
          <DrawerPrimitive.Close
            className={cn(OVERLAY_CLOSE_CLASS, OVERLAY_CLOSE_POSITION_CLASS, "z-10")}
            data-slot="drawer-close"
          >
            <XIcon />

            <span className="sr-only">{t("Common.actions.close")}</span>
          </DrawerPrimitive.Close>
        )}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex shrink-0 flex-col gap-0.5 p-4 md:gap-1.5", OVERLAY_HEADER_ALIGNMENT_CLASS, className)}
      data-slot="drawer-header"
      {...props}
    />
  );
}

function DrawerBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn(OVERLAY_SCROLL_REGION, "px-4", className)} data-slot="drawer-body" {...props} />;
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-auto flex shrink-0 flex-col gap-2 p-4 pb-[calc(1rem+var(--safe-bottom))]", className)}
      data-slot="drawer-footer"
      {...props}
    />
  );
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      className={cn("font-semibold text-foreground", className)}
      data-slot="drawer-title"
      {...props}
    />
  );
}

function DrawerDescription({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      data-slot="drawer-description"
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
