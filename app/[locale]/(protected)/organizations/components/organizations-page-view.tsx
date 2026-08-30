"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { OrganizationDto } from "@/features/organizations/organization.schema";

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

import { OrganizationsPageSkeleton } from "./organizations-page-skeleton";
import { useOrganizationColumns } from "./use-organization-columns";

type Props = {
  organizations: GetResult<OrganizationDto>;
};

export const OrganizationsPageView = observer(function OrganizationsPageView({ organizations }: Props) {
  const { contactsStore, dealsStore, importWizardStore, organizationsStore } = useRootStore();

  useDataViewSync(organizationsStore, organizations, [contactsStore, dealsStore]);
  const openEntity = useOpenEntity();
  const entityHref = useEntityHref();
  const columns = useOrganizationColumns();
  const { singular } = useEntityTerminology();
  const t = useTranslations();

  const view = resolveDataViewView(organizationsStore.viewMode, organizationsStore.groupingColumnId);
  const hasActiveQuery =
    Boolean(organizationsStore.searchTerm?.trim()) || (organizationsStore.filters?.length ?? 0) > 0;
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery,
    itemCount: organizationsStore.items.length,
    request: organizationsStore.dataRequest,
    total: organizationsStore.pagination?.total,
  });
  const emptyActionLabel = t("Common.emptyState.cta", {
    singular: singular(EntityType.organization),
  });
  const handleAdd = useCallback(() => openEntity(EntityType.organization, "new"), [openEntity]);
  const rowHref = useCallback(
    (organization: OrganizationDto) => entityHref(EntityType.organization, organization.id),
    [entityHref],
  );
  const handleExport = useExportAction(organizationsStore);
  const handleImport = useCallback(
    () => importWizardStore.openForEntity(EntityType.organization, () => organizationsStore.refresh()),
    [importWizardStore, organizationsStore],
  );
  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        addLabel={pageState === "true-empty" ? emptyActionLabel : undefined}
        anchorScope="organizations"
        store={organizationsStore}
        onAdd={handleAdd}
        onExport={handleExport}
        onImport={handleImport}
      />
    ),
    [emptyActionLabel, handleAdd, handleExport, handleImport, organizationsStore, pageState],
  );

  useSetTopBarActions(topBarNode);

  let body: ReactNode;
  switch (pageState) {
    case "error":
      body = (
        <PageState
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => organizationsStore.setQueryOptions({ forceRefresh: true })}
            >
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
        <PageState
          background={<OrganizationsPageSkeleton view={view} />}
          label={t("PageState.loading")}
          state="loading"
        />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty reason="filtered" store={organizationsStore} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          actionLabel={emptyActionLabel}
          background={<OrganizationsPageSkeleton animated={false} view={view} />}
          reason="true-empty"
          store={organizationsStore}
          onAdd={handleAdd}
        />
      );
      break;
    case "content":
      body = <DataViewContent columns={columns} rowHref={rowHref} store={organizationsStore} view={view} />;
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return (
    <DataViewLayout showPagination={pageState === "content" && view !== "board"} store={organizationsStore}>
      {body}
    </DataViewLayout>
  );
});
