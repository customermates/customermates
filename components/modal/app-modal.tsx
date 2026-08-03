"use client";

import type { ReactNode } from "react";
import type { BaseModalStore } from "@/core/base/base-modal.store";

import { observer } from "mobx-react-lite";
import { XIcon } from "lucide-react";

import { VisuallyHidden } from "radix-ui";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/core/utils/cn";
import { useIsWiderThan } from "@/hooks/use-media-query";

import { UnsavedChangesGuard } from "./unsaved-changes-guard";

export type ModalSize = "sm" | "md" | "lg" | "xl";

const sizeClassMap: Record<ModalSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
};

type Props = {
  store?: BaseModalStore;
  title?: ReactNode;
  size?: ModalSize;
  className?: string;
  children: ReactNode;
  open?: boolean;
  onClose?: () => void;
};

export const AppModal = observer(({ store, title, size = "md", className, children, open, onClose }: Props) => {
  const isOpen = open ?? store?.isOpen ?? false;
  const isWide = useIsWiderThan("md");

  function requestClose() {
    if (store?.withUnsavedChangesGuard && store?.hasUnsavedChanges) {
      store.setIsClosingWithGuard(true);
      return;
    }
    if (onClose) onClose();
    else store?.close();
  }

  function handleOpenChange(next: boolean) {
    if (!next) requestClose();
  }

  const accessibleTitle = title ?? "Dialog";

  return (
    <>
      {isWide ? (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
          <DialogContent
            className={cn("flex flex-col gap-0 border-0 bg-transparent p-0 shadow-none", sizeClassMap[size], className)}
          >
            <VisuallyHidden.Root>
              <DialogHeader>
                <DialogTitle>{accessibleTitle}</DialogTitle>
              </DialogHeader>
            </VisuallyHidden.Root>

            {children}
          </DialogContent>
        </Dialog>
      ) : (
        <Drawer open={isOpen} repositionInputs={false} onOpenChange={handleOpenChange}>
          <DrawerContent className={cn("gap-0", className)}>
            <VisuallyHidden.Root>
              <DrawerHeader>
                <DrawerTitle>{accessibleTitle}</DrawerTitle>
              </DrawerHeader>
            </VisuallyHidden.Root>

            <DrawerClose className="absolute top-4 right-4 z-10 -m-2.5 grid place-items-center rounded-xs p-2.5 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
              <XIcon className="size-4" />

              <span className="sr-only">Close</span>
            </DrawerClose>

            {children}
          </DrawerContent>
        </Drawer>
      )}

      {store && (
        <UnsavedChangesGuard
          open={store.isClosingWithGuard}
          onCancel={() => store.setIsClosingWithGuard(false)}
          onConfirm={() => store.close()}
        />
      )}
    </>
  );
});
