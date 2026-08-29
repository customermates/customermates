"use client";

import type { P13nEntry } from "@/features/p13n/prisma-p13n.repository";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Sheet, SheetBody, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "radix-ui";
import { useRootStore } from "@/core/stores/root-store.provider";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
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
import { EntityDetailPersonalizationProvider } from "@/components/entity-detail/entity-detail-personalization";
import { getP13nAction } from "@/app/actions";

export const EntityDrawer = observer(() => {
  const t = useTranslations();
  const { top, popTop } = useEntityDrawerStack();
  const { singular } = useEntityTerminology();
  const rootStore = useRootStore();
  const lastLoadedRef = useRef<string | null>(null);
  const [loadGate] = useState(() => new EntityDrawerLoadGate());
  const [preparedKey, setPreparedKey] = useState<string | null>(null);
  const [personalizationState, setPersonalizationState] = useState<{
    key: string;
    initial: P13nEntry | null;
  } | null>(null);
  const [isConfirmingClose, setIsConfirmingClose] = useState(false);
  const focusReturn = useOverlayFocusReturn(Boolean(top));
  const topEntityType = top?.entityType ?? null;
  const topId = top?.id ?? null;
  const activeKey = topEntityType && topId ? `${topEntityType}:${topId}` : null;
  const p13nId = topEntityType ? ENTITY_DETAIL[topEntityType].personalization?.(undefined)?.p13nId : undefined;
  const personalizationScope = rootStore.userStore.user?.id ?? "anonymous";
  const requestKey = activeKey ? `${personalizationScope}:${p13nId ?? "disabled"}:${activeKey}` : null;

  useEffect(() => {
    if (!activeKey || !requestKey || !topEntityType || !topId) {
      loadGate.cancel();
      lastLoadedRef.current = null;
      setPreparedKey(null);
      setPersonalizationState(null);
      return;
    }
    if (lastLoadedRef.current === requestKey) return;
    lastLoadedRef.current = requestKey;
    setPreparedKey(null);
    setPersonalizationState(null);
    const attempt = loadGate.begin(requestKey);

    const config = ENTITY_DETAIL[topEntityType];
    const store = config.store(rootStore);
    const entityLoad = topId === "new" ? store.add() : store.loadById(topId);
    const personalizationLoad = p13nId
      ? getP13nAction({ p13nId })
          .then((result) => (result.ok ? (result.data ?? null) : null))
          .catch((error) => {
            reportApplicationError(error);
            return null;
          })
      : Promise.resolve(null);
    let active = true;
    void Promise.allSettled([entityLoad, personalizationLoad])
      .then(([entityResult, personalizationResult]) => {
        if (!active || !loadGate.isCurrent(attempt, requestKey)) return;

        setPersonalizationState({
          key: requestKey,
          initial: personalizationResult.status === "fulfilled" ? personalizationResult.value : null,
        });
        setPreparedKey(requestKey);
        if (entityResult.status === "rejected") reportApplicationError(entityResult.reason);
      })
      .catch(reportApplicationError);

    return () => {
      active = false;
      if (lastLoadedRef.current === requestKey) lastLoadedRef.current = null;
    };
  }, [activeKey, loadGate, p13nId, requestKey, rootStore, topEntityType, topId]);

  function closeTop() {
    if (!top) return;
    loadGate.cancel();
    lastLoadedRef.current = null;
    setPersonalizationState(null);
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
  const personalization = detailConfig?.personalization?.(detailStore?.customColumns, (resource) =>
    rootStore.userStore.canAccess(resource),
  );
  const personalizationInitial = personalizationState?.key === requestKey ? personalizationState.initial : null;
  const isPrepared = requestKey !== null && preparedKey === requestKey;
  const drawerState = resolveEntityDrawerPageState({
    hasActiveEntity: Boolean(top),
    isNew: top?.id === "new",
    isPrepared,
    requestState: detailStore?.entityLoadState ?? "idle",
  });

  function retry() {
    if (!top || !detailStore || !requestKey) return;
    setPreparedKey(null);
    const attempt = loadGate.begin(requestKey);
    runUserAction(() =>
      (top.id === "new" ? detailStore.add() : detailStore.loadById(top.id)).finally(() => {
        if (loadGate.isCurrent(attempt, requestKey)) setPreparedKey(requestKey);
      }),
    );
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
            <Button size="sm" variant="secondary" onClick={retry}>
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
      drawerBody = DetailView ? (
        <EntityDetailPersonalizationProvider
          key={`${personalizationScope}:${personalization?.p13nId ?? "disabled"}:${activeKey}`}
          applyFieldVisibility={top?.id !== "new"}
          config={personalization}
          customColumnIds={detailStore?.customColumns.map((column) => column.id)}
          initial={personalizationInitial}
          persistenceScope={personalizationScope}
        >
          <DetailView layout="drawer" />
        </EntityDetailPersonalizationProvider>
      ) : null;
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
