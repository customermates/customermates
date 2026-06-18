"use client";

import { observer } from "mobx-react-lite";
import { useEffect, useRef } from "react";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "radix-ui";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useEntityDrawerStack } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { ENTITY_DETAIL } from "@/components/entity-detail/entity-detail.registry";

export const EntityDrawer = observer(() => {
  const { top, popTop } = useEntityDrawerStack();
  const rootStore = useRootStore();
  const lastLoadedRef = useRef<string | null>(null);

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
    if (!open) popTop();
  }

  const DetailView = top ? ENTITY_DETAIL[top.entityType].DetailView : null;

  return (
    <Sheet open={Boolean(top)} onOpenChange={handleOpenChange}>
      <SheetContent className="p-0 overflow-y-auto" side="right">
        <VisuallyHidden.Root>
          <SheetTitle>{top ? top.entityType : "Detail"}</SheetTitle>
        </VisuallyHidden.Root>

        {DetailView && <DetailView layout="drawer" />}
      </SheetContent>
    </Sheet>
  );
});
