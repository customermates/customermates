"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { observer } from "mobx-react-lite";

import type { DataViewView } from "./data-view-state";

import { useColumnLabel } from "@/components/entity-terminology/use-column-label";

import { DataCardView } from "./data-card-view";
import { DataKanbanView } from "./data-kanban-view";
import { DataTable } from "./data-table";

type Props<E extends HasId> = {
  columns: ColumnDef<E>[];
  onRowClick?: (item: E) => void;
  rowHref?: (item: E) => string | undefined;
  store: BaseDataViewStore<E>;
  view: DataViewView;
};

export const DataViewContent = observer(function DataViewContent<E extends HasId>({
  columns,
  onRowClick,
  rowHref,
  store,
  view,
}: Props<E>) {
  const columnLabel = useColumnLabel();
  const byId = new Map(columns.map((column) => [column.id ?? "", column]));
  const resolvedColumns = store.orderedColumns
    .map((tableColumn) => byId.get(tableColumn.uid))
    .filter((column): column is ColumnDef<E> => column !== undefined)
    .map((column) => {
      const withHeader = column.header ? column : { ...column, header: columnLabel(column.id ?? "") };
      return column.id && store.sortableColumnIds.has(column.id)
        ? ({ ...withHeader, accessorKey: column.id } as ColumnDef<E>)
        : withHeader;
    });

  if (view === "table") {
    return (
      <DataTable
        className="animate-page-result-in motion-reduce:animate-none"
        columns={resolvedColumns}
        store={store}
        onRowClick={onRowClick}
        onRowHref={rowHref}
      />
    );
  }

  if (view === "board") {
    return (
      <DataKanbanView
        cardHref={rowHref}
        className="animate-page-result-in motion-reduce:animate-none"
        columns={resolvedColumns}
        store={store}
        onCardClick={onRowClick}
      />
    );
  }

  return (
    <DataCardView
      cardHref={rowHref}
      className="animate-page-result-in motion-reduce:animate-none"
      columns={resolvedColumns}
      store={store}
      onCardClick={onRowClick}
    />
  );
});
