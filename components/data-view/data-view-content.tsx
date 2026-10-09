"use client";

import type { ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { observer } from "mobx-react-lite";
import { useClientReady } from "@/hooks/use-client-ready";

import type { DataViewView } from "./data-view-state";

import { useColumnLabel } from "@/components/data-view/use-column-label";

import { DataKanbanView } from "./data-kanban-view";
import { DataTable } from "./data-table";

type Props<E extends HasId> = {
  columns: ColumnDef<E>[];
  onRowClick?: (item: E) => void;
  rowHref?: (item: E) => string | undefined;
  rowActions?: (item: E) => ReactNode;
  rowFocusKey?: (item: E) => string | undefined;
  renderCard?: (item: E) => ReactNode;
  store: BaseDataViewStore<E>;
  view: DataViewView;
};

export const DataViewContent = observer(function DataViewContent<E extends HasId>({
  columns,
  onRowClick,
  rowHref,
  rowActions,
  rowFocusKey,
  renderCard,
  store,
  view,
}: Props<E>) {
  const interactive = useClientReady();
  const columnLabel = useColumnLabel();
  const byId = new Map(columns.map((column) => [column.id ?? "", column]));
  const resolvedColumns = store.orderedColumns
    .map((tableColumn) => byId.get(tableColumn.uid))
    .filter((column): column is ColumnDef<E> => column !== undefined)
    .map((column) => {
      const withHeader = column.header ? column : { ...column, header: columnLabel(column.id ?? "") };
      return column.id && store.sortableColumnIds.has(column.id)
        ? ({ ...withHeader, accessorKey: column.id } as ColumnDef<E>)
        : ({ ...withHeader, enableSorting: false } as ColumnDef<E>);
    });

  if (view === "table" || !renderCard) {
    return (
      <DataTable
        className="animate-page-result-in motion-reduce:animate-none"
        columns={resolvedColumns}
        rowActions={rowActions}
        rowFocusKey={rowFocusKey}
        store={store}
        onRowClick={interactive ? onRowClick : undefined}
        onRowHref={rowHref}
      />
    );
  }

  return (
    <DataKanbanView
      cardActions={rowActions}
      cardHref={rowHref}
      className="animate-page-result-in motion-reduce:animate-none"
      renderCard={renderCard}
      store={store}
      onCardClick={interactive ? onRowClick : undefined}
    />
  );
});
