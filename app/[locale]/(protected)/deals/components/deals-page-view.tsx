"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { DealDto } from "@/features/deals/deal.schema";

import { observer } from "mobx-react-lite";
import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { DataViewContent } from "@/components/data-view/data-view-content";
import { DataViewEmpty } from "@/components/data-view/data-view-empty";
import { DataViewLayout } from "@/components/data-view/data-view-layout";
import { resolveDataViewPageState, resolveDataViewView } from "@/components/data-view/data-view-state";
import { DataViewToolbar } from "@/components/data-view/data-view-toolbar";
import { useDataViewSync } from "@/components/data-view/use-data-view-sync";
import { useExportAction } from "@/features/data-transfer/export/use-export-download";
import { useEntityHref, useOpenEntity } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

import { DealsPageSkeleton } from "./deals-page-skeleton";
import { useDealColumns } from "./use-deal-columns";

type Props = { deals: GetResult<DealDto> };

export const DealsPageView = observer(function DealsPageView({ deals }: Props) {
  const { contactsStore, dealsStore, importWizardStore, organizationsStore, servicesStore } = useRootStore();

  useDataViewSync(dealsStore, deals, [organizationsStore, contactsStore, servicesStore]);
  const openEntity = useOpenEntity();
  const entityHref = useEntityHref();
  const columns = useDealColumns();
  const { singular } = useEntityTerminology();
  const t = useTranslations();

  const view = resolveDataViewView(dealsStore.viewMode, dealsStore.isGrouped);
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery: Boolean(dealsStore.searchTerm?.trim()) || (dealsStore.filters?.length ?? 0) > 0,
    isGrouped: dealsStore.isGrouped,
    itemCount: dealsStore.items.length,
    request: dealsStore.dataRequest,
    total: dealsStore.pagination?.total,
  });
  const emptyActionLabel = t("Common.emptyState.cta", { singular: singular(EntityType.deal) });
  const handleAdd = useCallback(() => openEntity(EntityType.deal, "new"), [openEntity]);
  const rowHref = useCallback((deal: DealDto) => entityHref(EntityType.deal, deal.id), [entityHref]);
  const handleExport = useExportAction(dealsStore);
  const handleImport = useCallback(
    () => importWizardStore.openForEntity(EntityType.deal, () => dealsStore.refresh()),
    [importWizardStore, dealsStore],
  );
  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        addLabel={pageState === "true-empty" ? emptyActionLabel : undefined}
        anchorScope="deals"
        store={dealsStore}
        onAdd={handleAdd}
        onExport={handleExport}
        onImport={handleImport}
      />
    ),
    [dealsStore, emptyActionLabel, handleAdd, handleExport, handleImport, pageState],
  );
  useSetTopBarActions(topBarNode);

  let body: ReactNode;
  switch (pageState) {
    case "error":
      body = (
        <PageState
          action={
            <Button size="sm" variant="secondary" onClick={() => dealsStore.setQueryOptions({ forceRefresh: true })}>
              {t("ErrorCard.retry")}
            </Button>
          }
          description={t("ErrorCard.contactSupport")}
          state="error"
          title={t("ErrorCard.title")}
        />
      );
      break;
    case "loading":
      body = (
        <PageState background={<DealsPageSkeleton view={view} />} label={t("PageState.loading")} state="loading" />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty reason="filtered" store={dealsStore} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          actionLabel={emptyActionLabel}
          background={<DealsPageSkeleton animated={false} view={view} />}
          reason="true-empty"
          store={dealsStore}
          onAdd={handleAdd}
        />
      );
      break;
    case "content":
      body = <DataViewContent columns={columns} rowHref={rowHref} store={dealsStore} view={view} />;
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return (
    <DataViewLayout
      showPagination={pageState === "content" && view !== "board" && !dealsStore.isGrouped}
      store={dealsStore}
    >
      {body}
    </DataViewLayout>
  );
});
