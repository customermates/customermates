"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Sheet, SheetBody, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "radix-ui";
import { useRootStore } from "@/core/stores/root-store.provider";
import {
  focusEntityDrawerInvoker,
  useEntityDrawerStack,
} from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { ENTITY_DETAIL } from "@/components/entity-detail/entity-detail.registry";
import { UnsavedChangesGuard } from "@/components/modal/unsaved-changes-guard";
import { useOverlayFocusReturn } from "@/components/ui/use-overlay-focus-return";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";

export const EntityDrawer = observer(() => {
  const t = useTranslations();
  const { top, popTop } = useEntityDrawerStack();
  const { singular } = useEntityTerminology();
  const rootStore = useRootStore();
  const lastLoadedRef = useRef<string | null>(null);
  const [isConfirmingClose, setIsConfirmingClose] = useState(false);
  const focusReturn = useOverlayFocusReturn(Boolean(top));

  useEffect(() => {
    if (!top) {
      lastLoadedRef.current = null;
      return;
    }
    const key = `${top.entityType}:${top.id}`;
    if (lastLoadedRef.current === key) return;
    lastLoadedRef.current = key;

    const store = ENTITY_DETAIL[top.entityType].store(rootStore);
    if (top.id === "new") void store.add();
    else void store.loadById(top.id);
  }, [top, rootStore]);

  function handleOpenChange(open: boolean) {
    if (open || !top) return;

    const store = ENTITY_DETAIL[top.entityType].store(rootStore);
    if (store.withUnsavedChangesGuard && store.hasUnsavedChanges) {
      setIsConfirmingClose(true);
      return;
    }

    popTop();
  }

  function handleDiscard() {
    setIsConfirmingClose(false);
    if (top) ENTITY_DETAIL[top.entityType].store(rootStore).resetForm();
    popTop();
  }

  function handleCloseAutoFocus(event: Event) {
    if (focusEntityDrawerInvoker()) {
      event.preventDefault();
      return;
    }

    focusReturn.onCloseAutoFocus(event);
  }

  const DetailView = top ? ENTITY_DETAIL[top.entityType].DetailView : null;

  return (
    <>
      <Sheet open={Boolean(top)} onOpenChange={handleOpenChange}>
        <SheetContent
          className="gap-0 sm:max-w-[640px]"
          side="left"
          {...focusReturn}
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          <VisuallyHidden.Root>
            <SheetTitle>{top ? singular(top.entityType) : t("Common.details")}</SheetTitle>
          </VisuallyHidden.Root>

          <SheetBody className="flex flex-col overflow-hidden px-0">
            {DetailView && <DetailView layout="drawer" />}
          </SheetBody>
        </SheetContent>
      </Sheet>

      <UnsavedChangesGuard
        open={isConfirmingClose}
        onCancel={() => setIsConfirmingClose(false)}
        onConfirm={handleDiscard}
      />
    </>
  );
});
