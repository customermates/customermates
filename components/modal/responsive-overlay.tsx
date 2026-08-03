"use client";

import type { ReactNode } from "react";

import { Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { OVERLAY_SCROLL_REGION } from "@/components/ui/overlay-contract";
import { cn } from "@/core/utils/cn";
import { useIsWiderThan } from "@/hooks/use-media-query";

type Props = {
  trigger: ReactNode;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  align?: "start" | "center" | "end";
  popoverClassName?: string;
};

export function ResponsiveOverlay({
  trigger,
  title,
  children,
  footer,
  open,
  onOpenChange,
  align = "start",
  popoverClassName,
}: Props) {
  const isWide = useIsWiderThan("md");

  return (
    <>
      <Popover open={isWide && open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild aria-expanded={open}>
          {trigger}
        </PopoverTrigger>

        <PopoverContent
          align={align}
          className={cn(
            "flex max-h-(--radix-popover-content-available-height) flex-col overflow-hidden p-0",
            popoverClassName,
          )}
        >
          <PopoverHeader className="shrink-0 border-b border-border px-4 py-3">
            <PopoverTitle>{title}</PopoverTitle>
          </PopoverHeader>

          <div className={cn(OVERLAY_SCROLL_REGION, "p-4")}>{children}</div>

          {footer && (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border p-3">
              {footer}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {!isWide && (
        <Drawer open={open} repositionInputs={false} onOpenChange={onOpenChange}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle className="min-w-0 truncate">{title}</DrawerTitle>
            </DrawerHeader>

            <DrawerBody className="pb-4">{children}</DrawerBody>

            {footer && <DrawerFooter className="flex-col-reverse">{footer}</DrawerFooter>}
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}
