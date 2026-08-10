"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { ColumnDef } from "@tanstack/react-table";

import { observer } from "mobx-react-lite";
import { useCallback, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";

import { ViewMode } from "@/core/base/base-query-builder";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useColumnLabel } from "@/components/entity-terminology/use-column-label";
import { ScrollReturnButton } from "@/components/scroll/scroll-return-button";
import { useScrollReturn } from "@/components/scroll/use-scroll-return";

import { DataCardView } from "./data-card-view";
import { DataKanbanView } from "./data-kanban-view";
import { DataTable } from "./data-table";
import { DataViewEmpty } from "./data-view-empty";
import { DataViewActiveFiltersBar } from "./header/active-filters-bar";
import { DataViewPagination } from "./header/pagination";
import { DataViewToolbar } from "./data-view-toolbar";
import { MassActionsBar } from "./mass-actions-bar";

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
}: Props<E>) {
  const columnLabel = useColumnLabel();
  const t = useTranslations();
  const { terminologyStore } = useRootStore();
  const scrollHostRef = useRef<HTMLDivElement>(null);
  const getScrollElement = useCallback(
    () =>
      scrollHostRef.current?.querySelector<HTMLElement>(
        "[data-slot=table-container],[data-slot=kanban-root],[data-slot=card-grid]",
      ) ?? null,
    [],
  );
  const hasItems = store.items.length > 0;
  const { isAway, returnToAnchor } = useScrollReturn({
    direction: "top",
    enabled: hasItems,
    getScrollElement,
  });

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
        anchorScope={anchorScope}
        isSearchable={isSearchable}
        searchPlaceholder={searchPlaceholder}
        store={store}
        onAdd={onAdd}
      />
    ),
    [anchorScope, isSearchable, searchPlaceholder, store, onAdd],
  );

  useSetTopBarActions(topBarNode);

  if (!store.isReady) return null;

  const isTable = store.viewMode === ViewMode.table;
  const isKanban = store.viewMode === ViewMode.card && Boolean(store.groupingColumnId);
  const isEmpty = store.items.length === 0;

  const body = isEmpty ? (
    <DataViewEmpty descriptor={emptyState} store={store} onAdd={onAdd} />
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
        ref={scrollHostRef}
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden *:data-[slot=table-container]:h-full *:data-[slot=table-container]:overflow-auto *:data-[slot=kanban-root]:h-full *:data-[slot=kanban-root]:overflow-auto *:data-[slot=card-grid]:h-full *:data-[slot=card-grid]:overflow-y-auto"
        style={{ contain: "layout" }}
      >
        {body}

        <ScrollReturnButton
          direction="top"
          isAway={isAway}
          label={t("Common.scroll.backToTop")}
          onReturn={returnToAnchor}
        />
      </div>

      {!isKanban && !isEmpty && <DataViewPagination store={store} />}
    </div>
  );
});
