"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { ColumnDef } from "@tanstack/react-table";

import { observer } from "mobx-react-lite";
import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { PageState } from "@/components/page-state/page-state";
import type { PageSkeletonSpec } from "@/components/page-state/page-skeleton";
import { Button } from "@/components/ui/button";

import { DataViewContent } from "./data-view-content";
import { DataViewEmpty } from "./data-view-empty";
import { DataViewLayout } from "./data-view-layout";
import { DataViewToolbar } from "./data-view-toolbar";
import { resolveDataViewPageState, resolveDataViewSkeletonView } from "./data-view-state";

import type { EmptyStateDescriptor } from "./data-view-empty";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  columns: ColumnDef<E>[];
  onRowClick?: (item: E) => void;
  rowHref?: (item: E) => string | undefined;
  onAdd?: () => void;
  isSearchable?: boolean;
  searchPlaceholder?: string;
  anchorScope?: string;
  emptyState?: EmptyStateDescriptor;
  tableSkeletonVariant?: "contact" | "entity" | "member" | "plain";
};

export const DataViewContainer = observer(function DataViewContainer<E extends HasId>({
  store,
  columns,
  onRowClick,
  rowHref,
  onAdd,
  isSearchable = true,
  searchPlaceholder,
  anchorScope,
  emptyState,
  tableSkeletonVariant,
}: Props<E>) {
  const { singular } = useEntityTerminology();
  const t = useTranslations();

  const skeletonView = resolveDataViewSkeletonView(store.viewMode, store.groupingColumnId);
  const skeleton: PageSkeletonSpec =
    skeletonView === "table"
      ? {
          kind: "data-view",
          tableVariant:
            tableSkeletonVariant ??
            (store.entityType === "contact" ? "contact" : store.entityType ? "entity" : "plain"),
          view: "table",
        }
      : {
          identity: store.entityType === "contact" ? "avatar" : "text",
          kind: "data-view",
          view: skeletonView,
        };
  const hasActiveQuery = Boolean(store.searchTerm?.trim()) || (store.filters?.length ?? 0) > 0;
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    failure: store.refreshError !== null,
    hasActiveQuery,
    hasUsableContent: store.isReady,
    isReady: store.isReady,
    isRefreshing: store.isRefreshing,
    itemCount: store.items.length,
    total: store.pagination?.total,
  });
  const trueEmptyActionLabel =
    emptyState?.ctaLabel ??
    (store.entityType ? t("Common.emptyState.cta", { singular: singular(store.entityType) }) : t("Common.actions.add"));

  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        addLabel={pageState === "true-empty" ? trueEmptyActionLabel : undefined}
        anchorScope={anchorScope}
        isSearchable={isSearchable}
        searchPlaceholder={searchPlaceholder}
        store={store}
        onAdd={onAdd}
      />
    ),
    [anchorScope, isSearchable, searchPlaceholder, store, pageState, trueEmptyActionLabel, onAdd],
  );

  useSetTopBarActions(topBarNode);

  const body =
    pageState === "error" ? (
      <PageState
        action={
          <Button size="sm" variant="outline" onClick={() => store.setQueryOptions({ forceRefresh: true })}>
            {t("ErrorCard.retry")}
          </Button>
        }
        description={t("ErrorCard.contactSupport")}
        state="error"
        title={t("ErrorCard.title")}
      />
    ) : pageState === "loading" ? (
      <PageState label={t("PageState.loading")} skeleton={skeleton} state="loading" />
    ) : pageState === "filtered-empty" ? (
      <DataViewEmpty descriptor={emptyState} reason="filtered" store={store} />
    ) : pageState === "true-empty" ? (
      <DataViewEmpty
        actionLabel={trueEmptyActionLabel}
        descriptor={emptyState}
        reason="true-empty"
        skeleton={skeleton}
        store={store}
        onAdd={onAdd}
      />
    ) : (
      <DataViewContent columns={columns} rowHref={rowHref} store={store} view={skeletonView} onRowClick={onRowClick} />
    );

  return (
    <DataViewLayout showPagination={pageState === "content" && skeletonView !== "board"} store={store}>
      {body}
    </DataViewLayout>
  );
});
