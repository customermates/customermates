"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { ServiceDto } from "@/features/services/service.schema";

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
import { useEntityHref, useOpenEntity } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

import { ServicesPageSkeleton } from "./services-page-skeleton";
import { useServiceColumns } from "./use-service-columns";

type Props = { services: GetResult<ServiceDto> };

export const ServicesPageView = observer(function ServicesPageView({ services }: Props) {
  const { dealsStore, servicesStore } = useRootStore();
  const openEntity = useOpenEntity();
  const entityHref = useEntityHref();
  const columns = useServiceColumns();
  const { singular } = useEntityTerminology();
  const t = useTranslations();

  useDataViewSync(servicesStore, services, [dealsStore]);

  const view = resolveDataViewView(servicesStore.viewMode, servicesStore.groupingColumnId);
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery: Boolean(servicesStore.searchTerm?.trim()) || (servicesStore.filters?.length ?? 0) > 0,
    itemCount: servicesStore.items.length,
    request: servicesStore.dataRequest,
    total: servicesStore.pagination?.total,
  });
  const emptyActionLabel = t("Common.emptyState.cta", { singular: singular(EntityType.service) });
  const handleAdd = useCallback(() => openEntity(EntityType.service, "new"), [openEntity]);
  const rowHref = useCallback((service: ServiceDto) => entityHref(EntityType.service, service.id), [entityHref]);
  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        addLabel={pageState === "true-empty" ? emptyActionLabel : undefined}
        anchorScope="services"
        store={servicesStore}
        onAdd={handleAdd}
      />
    ),
    [emptyActionLabel, handleAdd, pageState, servicesStore],
  );
  useSetTopBarActions(topBarNode);

  let body: ReactNode;
  switch (pageState) {
    case "error":
      body = (
        <PageState
          action={
            <Button size="sm" variant="outline" onClick={() => servicesStore.setQueryOptions({ forceRefresh: true })}>
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
        <PageState background={<ServicesPageSkeleton view={view} />} label={t("PageState.loading")} state="loading" />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty reason="filtered" store={servicesStore} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          actionLabel={emptyActionLabel}
          background={<ServicesPageSkeleton animated={false} view={view} />}
          reason="true-empty"
          store={servicesStore}
          onAdd={handleAdd}
        />
      );
      break;
    case "content":
      body = <DataViewContent columns={columns} rowHref={rowHref} store={servicesStore} view={view} />;
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return (
    <DataViewLayout showPagination={pageState === "content" && view !== "board"} store={servicesStore}>
      {body}
    </DataViewLayout>
  );
});
