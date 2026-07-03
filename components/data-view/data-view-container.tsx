"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { ColumnDef } from "@tanstack/react-table";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { ViewMode } from "@/core/base/base-query-builder";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";

import { DataCardView } from "./data-card-view";
import { DataKanbanView } from "./data-kanban-view";
import { DataTable } from "./data-table";
import { DataViewActiveFiltersBar } from "./header/active-filters-bar";
import { DataViewPagination } from "./header/pagination";
import { DataViewToolbar } from "./data-view-toolbar";
import { MassActionsBar } from "./mass-actions-bar";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  columns: ColumnDef<E>[];
  onRowClick?: (item: E) => void;
  rowHref?: (item: E) => string | undefined;
  onAdd?: () => void;
  isSearchable?: boolean;
  searchPlaceholder?: string;
};

export const DataViewContainer = observer(function DataViewContainer<E extends HasId>({
  store,
  columns,
  onRowClick,
  rowHref,
  onAdd,
  isSearchable = true,
  searchPlaceholder,
}: Props<E>) {
  const t = useTranslations();

  const resolvedColumns = useMemo<ColumnDef<E>[]>(() => {
    const byId = new Map(columns.map((c) => [c.id ?? "", c]));
    return store.orderedColumns
      .map((tc) => byId.get(tc.uid))
      .filter((c): c is ColumnDef<E> => c !== undefined)
      .map((c) => {
        const withHeader = c.header ? c : { ...c, header: t(`Common.table.columns.${c.id ?? ""}`) };
        return c.id && store.sortableColumnIds.has(c.id)
          ? ({ ...withHeader, accessorKey: c.id } as ColumnDef<E>)
          : withHeader;
      });
  }, [columns, store.orderedColumns, store.sortableColumnIds, t]);

  const topBarNode = useMemo(
    () => (
      <DataViewToolbar isSearchable={isSearchable} searchPlaceholder={searchPlaceholder} store={store} onAdd={onAdd} />
    ),
    [isSearchable, searchPlaceholder, store, onAdd],
  );

  useSetTopBarActions(topBarNode);

  if (!store.isReady) return null;

  const isTable = store.viewMode === ViewMode.table;
  const isKanban = store.viewMode === ViewMode.card && Boolean(store.groupingColumnId);

  const body = isTable ? (
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

      {!isKanban && <DataViewPagination store={store} />}
    </div>
  );
});
