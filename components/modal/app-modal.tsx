"use client";

import { useEffect, type ReactNode } from "react";
import type { BaseModalStore } from "@/core/base/base-modal.store";
import type { AppModalActionProps } from "./app-modal-action";

import { observer } from "mobx-react-lite";

import { VisuallyHidden } from "radix-ui";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useOverlayFocusReturn } from "@/components/ui/use-overlay-focus-return";
import { cn } from "@/core/utils/cn";
import { useIsWiderThan } from "@/hooks/use-media-query";

import { UnsavedChangesGuard } from "./unsaved-changes-guard";
import { AppModalAction, APP_MODAL_ACTION_RAIL_CLASS } from "./app-modal-action";

export type AppModalActions =
  | readonly []
  | readonly [AppModalActionProps]
  | readonly [AppModalActionProps, AppModalActionProps];

export type ModalSize = "sm" | "md" | "lg" | "xl" | "3xl" | "5xl";

const sizeClassMap: Record<ModalSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "3xl": "sm:max-w-3xl",
  "5xl": "sm:max-w-5xl",
};

type SharedProps = {
  title: ReactNode;
  actions?: AppModalActions;
  description?: ReactNode;
  size?: ModalSize;
  children: ReactNode;
};

type StoreProps = { store: BaseModalStore; open?: never; onClose?: never };
type ControlledProps = { store?: never; open: boolean; onClose: () => void };
type Props = SharedProps & (StoreProps | ControlledProps);

function hasStore(props: Props): props is SharedProps & StoreProps {
  return props.store !== undefined;
}

function AppModalActionRail({ actions }: { actions: readonly AppModalActionProps[] }) {
  return (
    <TooltipProvider>
      <div className={APP_MODAL_ACTION_RAIL_CLASS} data-slot="app-modal-actions">
        {actions.map((action) => (
          <AppModalAction key={action.id} {...action} />
        ))}
      </div>
    </TooltipProvider>
  );
}

export const AppModal = observer((props: Props) => {
  const { title, actions = [], description, size = "md", children } = props;
  const store = hasStore(props) ? props.store : undefined;
  const isOpen = hasStore(props) ? props.store.isOpen : props.open;
  const navigationGuard = store?.rootStore.navigationGuard;
  const isWide = useIsWiderThan("md");
  const actionCount = actions.length;
  const hasActions = actionCount > 0;

  if (actionCount > 2) throw new Error("AppModal supports at most two header actions");
  const focusReturn = useOverlayFocusReturn(isOpen, store?.focusReturnTarget, store?.focusReturnFallback);

  useEffect(() => {
    if (!store || !isOpen || !navigationGuard) return;
    navigationGuard.register(store);
    return () => navigationGuard.unregister(store);
  }, [isOpen, navigationGuard, store]);

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
            data-overlay-action-count={hasActions ? actionCount : undefined}
            data-overlay-actions={hasActions ? "" : undefined}
            {...(!description ? { "aria-describedby": undefined } : {})}
            {...focusReturn}
          >
            <VisuallyHidden.Root>
              <DialogTitle>{title}</DialogTitle>

              {description ? <DialogDescription>{description}</DialogDescription> : null}
            </VisuallyHidden.Root>

            {hasActions ? <AppModalActionRail actions={actions} /> : null}

            {children}
          </DialogContent>
        </Dialog>
      ) : (
        <Drawer open={isOpen} repositionInputs={false} onOpenChange={handleOpenChange}>
          <DrawerContent
            className="gap-0"
            data-overlay-action-count={hasActions ? actionCount : undefined}
            data-overlay-actions={hasActions ? "" : undefined}
            {...focusReturn}
          >
            <VisuallyHidden.Root>
              <DrawerTitle>{title}</DrawerTitle>

              {description ? <DrawerDescription>{description}</DrawerDescription> : null}
            </VisuallyHidden.Root>

            {hasActions ? <AppModalActionRail actions={actions} /> : null}

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
