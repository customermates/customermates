"use client";

import type { ReactNode } from "react";
import type { BaseModalStore } from "@/core/base/base-modal.store";

import { observer } from "mobx-react-lite";

import { VisuallyHidden } from "radix-ui";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { UnsavedChangesGuard } from "./unsaved-changes-guard";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

const sizeClassMap: Record<ModalSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  full: "sm:max-w-[calc(100vw-2rem)] sm:h-[calc(100vh-2rem)]",
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

  function requestClose() {
    if (store?.withUnsavedChangesGuard && store?.hasUnsavedChanges) {
      store.setIsClosingWithGuard(true);
      return;
    }
    if (onClose) onClose();
    else store?.close();
  }

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        <DialogContent
          className={cn(
            "p-0 gap-0 border-0 bg-transparent shadow-none",
            "flex flex-col max-h-[90vh]",
            sizeClassMap[size],
            className,
          )}
        >
          {title ? (
            <DialogHeader className="sr-only">
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>
          ) : (
            <VisuallyHidden.Root>
              <DialogTitle>Dialog</DialogTitle>
            </VisuallyHidden.Root>
          )}

          {children}
        </DialogContent>
      </Dialog>

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
