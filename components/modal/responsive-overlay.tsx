"use client";

import type { ReactNode } from "react";

import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverFooter,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { OVERLAY_SCROLL_REGION } from "@/components/ui/overlay-contract";
import { cn } from "@/core/utils/cn";
import { useIsWiderThan } from "@/hooks/use-media-query";

type Props = {
  trigger: ReactNode;
  title: ReactNode;
  headerAction?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  align?: "start" | "center" | "end";
  popoverClassName?: string;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onCloseAutoFocus?: (event: Event) => void;
};

export function ResponsiveOverlay({
  trigger,
  title,
  headerAction,
  children,
  footer,
  open,
  onOpenChange,
  align = "start",
  popoverClassName,
  onEscapeKeyDown,
  onCloseAutoFocus,
}: Props) {
  const isWide = useIsWiderThan("md");

  return isWide ? (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild aria-expanded={open}>
        {trigger}
      </PopoverTrigger>

      <PopoverContent
        align={align}
        className={cn(
          "flex max-h-(--radix-popover-content-available-height) flex-col overflow-hidden p-0",
          popoverClassName,
        )}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={onEscapeKeyDown}
      >
        <PopoverHeader className={cn("shrink-0 p-3", headerAction && "flex-row items-center gap-2 py-1.5 pr-1.5")}>
          <PopoverTitle className={cn(headerAction && "min-w-0 flex-1 truncate")}>{title}</PopoverTitle>

          {headerAction}
        </PopoverHeader>

        <div className={cn(OVERLAY_SCROLL_REGION)}>{children}</div>

        {footer && <PopoverFooter className="p-3">{footer}</PopoverFooter>}
      </PopoverContent>
    </Popover>
  ) : (
    <Drawer open={open} repositionInputs={false} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild aria-expanded={open}>
        {trigger}
      </DrawerTrigger>

      <DrawerContent
        data-overlay-actions={headerAction ? "" : undefined}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={onEscapeKeyDown}
      >
        <DrawerHeader className={cn(headerAction && "flex-row items-center gap-2 py-1.5 pr-[3.125rem]")}>
          <DrawerTitle className={cn("min-w-0 truncate", headerAction && "flex-1")}>{title}</DrawerTitle>

          {headerAction}
        </DrawerHeader>

        <DrawerBody className="px-0 pb-4">{children}</DrawerBody>

        {footer && <DrawerFooter className="flex-col-reverse">{footer}</DrawerFooter>}
      </DrawerContent>
    </Drawer>
  );
}
