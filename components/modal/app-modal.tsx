"use client";

import type { ReactNode } from "react";
import type { BaseModalStore } from "@/core/base/base-modal.store";

import { observer } from "mobx-react-lite";

import { VisuallyHidden } from "radix-ui";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useOverlayFocusReturn } from "@/components/ui/use-overlay-focus-return";
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

type SharedProps = {
  title: ReactNode;
  size?: ModalSize;
  children: ReactNode;
};

type StoreProps = { store: BaseModalStore; open?: never; onClose?: never };
type ControlledProps = { store?: never; open: boolean; onClose: () => void };
type Props = SharedProps & (StoreProps | ControlledProps);

function hasStore(props: Props): props is SharedProps & StoreProps {
  return props.store !== undefined;
}

export const AppModal = observer((props: Props) => {
  const { title, size = "md", children } = props;
  const store = hasStore(props) ? props.store : undefined;
  const isOpen = hasStore(props) ? props.store.isOpen : props.open;
  const isWide = useIsWiderThan("md");
  const focusReturn = useOverlayFocusReturn(isOpen, store?.focusReturnTarget, store?.focusReturnFallback);

  function requestClose() {
    if (store?.withUnsavedChangesGuard && store?.hasUnsavedChanges) {
      store.setIsClosingWithGuard(true);
      return;
    }
    if (hasStore(props)) props.store.close();
    else props.onClose();
  }

  function handleOpenChange(next: boolean) {
    if (!next) requestClose();
  }

  return (
    <>
      {isWide ? (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
          <DialogContent
            className={cn("flex flex-col gap-0 border-0 bg-transparent p-0 shadow-none", sizeClassMap[size])}
            {...focusReturn}
          >
            <VisuallyHidden.Root>
              <DialogTitle>{title}</DialogTitle>
            </VisuallyHidden.Root>

            {children}
          </DialogContent>
        </Dialog>
      ) : (
        <Drawer open={isOpen} repositionInputs={false} onOpenChange={handleOpenChange}>
          <DrawerContent className="gap-0" {...focusReturn}>
            <VisuallyHidden.Root>
              <DrawerTitle>{title}</DrawerTitle>
            </VisuallyHidden.Root>

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
