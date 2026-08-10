"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { ColumnDef } from "@tanstack/react-table";

import { observer } from "mobx-react-lite";
import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { ViewMode } from "@/core/base/base-query-builder";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useColumnLabel } from "@/components/entity-terminology/use-column-label";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { PageState } from "@/components/page-state/page-state";
import type { PageSkeletonSpec } from "@/components/page-state/page-skeleton";
import { Button } from "@/components/ui/button";

import { DataCardView } from "./data-card-view";
import { DataKanbanView } from "./data-kanban-view";
import { DataTable } from "./data-table";
import { DataViewEmpty } from "./data-view-empty";
import { DataViewActiveFiltersBar } from "./header/active-filters-bar";
import { DataViewPagination } from "./header/pagination";
import { DataViewToolbar } from "./data-view-toolbar";
import { MassActionsBar } from "./mass-actions-bar";
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
  const columnLabel = useColumnLabel();
  const { singular } = useEntityTerminology();
  const t = useTranslations();
  const { terminologyStore } = useRootStore();

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

  const resolvedColumns = useMemo<ColumnDef<E>[]>(() => {
    const byId = new Map(columns.map((c) => [c.id ?? "", c]));
    return store.orderedColumns
      .map((tc) => byId.get(tc.uid))
      .filter((c): c is ColumnDef<E> => c !== undefined)
      .map((c) => {
        const withHeader = c.header ? c : { ...c, header: columnLabel(c.id ?? "") };
        return c.id && store.sortableColumnIds.has(c.id)
          ? ({ ...withHeader, accessorKey: c.id } as ColumnDef<E>)
          : withHeader;
      });
  }, [columns, store.orderedColumns, store.sortableColumnIds, columnLabel, terminologyStore.overrides]);

  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        addLabel={pageState === "true-empty" ? trueEmptyActionLabel : undefined}
        anchorScope={anchorScope}
        deemphasizeAdd={pageState === "true-empty"}
        isSearchable={isSearchable}
        searchPlaceholder={searchPlaceholder}
        store={store}
        onAdd={onAdd}
      />
    ),
    [anchorScope, isSearchable, searchPlaceholder, store, pageState, trueEmptyActionLabel, onAdd],
  );

  useSetTopBarActions(topBarNode);

  const isTable = store.viewMode === ViewMode.table;
  const isKanban = store.viewMode === ViewMode.card && Boolean(store.groupingColumnId);
  const isEmpty = pageState === "filtered-empty" || pageState === "true-empty";

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
    ) : isEmpty ? (
      <DataViewEmpty
        actionLabel={trueEmptyActionLabel}
        descriptor={emptyState}
        reason={pageState === "filtered-empty" ? "filtered" : "true-empty"}
        skeleton={skeleton}
        store={store}
        onAdd={onAdd}
      />
    ) : isTable ? (
      <DataTable columns={resolvedColumns} store={store} onRowClick={onRowClick} onRowHref={rowHref} />
    ) : isKanban ? (
      <DataKanbanView cardHref={rowHref} columns={resolvedColumns} store={store} onCardClick={onRowClick} />
    ) : (
      <DataCardView cardHref={rowHref} columns={resolvedColumns} store={store} onCardClick={onRowClick} />
    );

  return (
    <div className="flex h-[calc(100svh-4rem)] min-h-0 flex-col md:h-[calc(100svh-5rem)]">
      <MassActionsBar store={store} />

      <DataViewActiveFiltersBar store={store} />

      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden *:data-[slot=table-container]:h-full *:data-[slot=table-container]:overflow-auto *:data-[slot=kanban-root]:h-full *:data-[slot=kanban-root]:overflow-auto *:data-[slot=card-grid]:h-full *:data-[slot=card-grid]:overflow-y-auto"
        style={{ contain: "layout" }}
      >
        {body}
      </div>

      {!isKanban && pageState === "content" && <DataViewPagination store={store} />}
    </div>
  );
});
