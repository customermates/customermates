"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";

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
import { PageState } from "@/components/page-state/page-state";
import { EntityDetailDrawerSkeleton } from "@/components/entity-detail/entity-detail-page-skeleton";
import { Button } from "@/components/ui/button";
import { EntityDrawerLoadGate } from "@/components/entity-detail/entity-drawer-load-gate";
import { resolveEntityDrawerPageState } from "@/components/entity-detail/entity-detail-page-state";

export const EntityDrawer = observer(() => {
  const t = useTranslations();
  const { top, popTop } = useEntityDrawerStack();
  const { singular } = useEntityTerminology();
  const rootStore = useRootStore();
  const lastLoadedRef = useRef<string | null>(null);
  const [loadGate] = useState(() => new EntityDrawerLoadGate());
  const [preparedKey, setPreparedKey] = useState<string | null>(null);
  const [isConfirmingClose, setIsConfirmingClose] = useState(false);
  const focusReturn = useOverlayFocusReturn(Boolean(top));
  const topEntityType = top?.entityType ?? null;
  const topId = top?.id ?? null;
  const activeKey = topEntityType && topId ? `${topEntityType}:${topId}` : null;

  useEffect(() => {
    if (!activeKey || !topEntityType || !topId) {
      loadGate.cancel();
      lastLoadedRef.current = null;
      setPreparedKey(null);
      return;
    }
    if (lastLoadedRef.current === activeKey) return;
    lastLoadedRef.current = activeKey;
    setPreparedKey(null);
    const attempt = loadGate.begin(activeKey);

    const store = ENTITY_DETAIL[topEntityType].store(rootStore);
    let active = true;
    void (topId === "new" ? store.add() : store.loadById(topId)).finally(() => {
      if (active && loadGate.isCurrent(attempt, activeKey)) setPreparedKey(activeKey);
    });

    return () => {
      active = false;
    };
  }, [activeKey, topEntityType, topId, rootStore, loadGate]);

  function closeTop() {
    if (!top) return;
    loadGate.cancel();
    lastLoadedRef.current = null;
    ENTITY_DETAIL[top.entityType].store(rootStore).close();
    popTop();
  }

  function handleOpenChange(open: boolean) {
    if (open || !top) return;

    const store = ENTITY_DETAIL[top.entityType].store(rootStore);
    if (store.withUnsavedChangesGuard && store.hasUnsavedChanges) {
      setIsConfirmingClose(true);
      return;
    }

    closeTop();
  }

  function handleDiscard() {
    setIsConfirmingClose(false);
    if (top) ENTITY_DETAIL[top.entityType].store(rootStore).resetForm();
    closeTop();
  }

  function handleCloseAutoFocus(event: Event) {
    if (focusEntityDrawerInvoker()) {
      event.preventDefault();
      return;
    }

    focusReturn.onCloseAutoFocus(event);
  }

  const detailConfig = top ? ENTITY_DETAIL[top.entityType] : null;
  const detailStore = top ? detailConfig?.store(rootStore) : null;
  const DetailView = detailConfig?.DetailView ?? null;
  const isPrepared = activeKey !== null && preparedKey === activeKey;
  const drawerState = resolveEntityDrawerPageState({
    hasActiveEntity: Boolean(top),
    isNew: top?.id === "new",
    isPrepared,
    requestState: detailStore?.entityLoadState ?? "idle",
  });

  function retry() {
    if (!top || !detailStore || !activeKey) return;
    setPreparedKey(null);
    const attempt = loadGate.begin(activeKey);
    void (top.id === "new" ? detailStore.add() : detailStore.loadById(top.id)).finally(() => {
      if (loadGate.isCurrent(attempt, activeKey)) setPreparedKey(activeKey);
    });
  }

  let drawerBody: ReactNode;
  switch (drawerState) {
    case "closed":
      drawerBody = null;
      break;
    case "loading":
      drawerBody = (
        <PageState
          background={<EntityDetailDrawerSkeleton showFooter={Boolean(detailStore?.canManage)} />}
          className="h-full"
          label={t("PageState.loading")}
          state="loading"
        />
      );
      break;
    case "not-found":
    case "error":
      drawerBody = (
        <PageState
          action={
            <Button size="sm" variant="outline" onClick={retry}>
              {t("ErrorCard.retry")}
            </Button>
          }
          className="h-full"
          description={drawerState === "not-found" ? t("PageState.notFoundDescription") : t("ErrorCard.contactSupport")}
          state="error"
          title={drawerState === "not-found" ? t("PageState.notFoundTitle") : t("ErrorCard.title")}
        />
      );
      break;
    case "content":
      drawerBody = DetailView ? <DetailView layout="drawer" /> : null;
      break;
    default: {
      const exhaustive: never = drawerState;
      drawerBody = exhaustive;
    }
  }

  return (
    <>
      <Sheet open={Boolean(top)} onOpenChange={handleOpenChange}>
        <SheetContent
          aria-describedby={undefined}
          className="gap-0 sm:max-w-[640px]"
          side="left"
          {...focusReturn}
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          <VisuallyHidden.Root>
            <SheetTitle>{top ? singular(top.entityType) : t("Common.details")}</SheetTitle>
          </VisuallyHidden.Root>

          <SheetBody className="flex flex-col overflow-hidden px-0">{drawerBody}</SheetBody>
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
