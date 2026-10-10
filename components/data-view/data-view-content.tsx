"use client";

import type { ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { RecordGroupSummaryResult } from "@/features/records/record-grouping.schema";

import { observer } from "mobx-react-lite";
import { useClientReady } from "@/hooks/use-client-ready";

import type { DataViewView } from "./data-view-state";

import { useColumnLabel } from "@/components/data-view/use-column-label";

import { DataKanbanView } from "./data-kanban-view";
import { DataTable, type DataTableColumnStyle } from "./data-table";

type Props<E extends HasId> = {
  columns: ColumnDef<E>[];
  onRowClick?: (item: E) => void;
  rowHref?: (item: E) => string | undefined;
  rowActions?: (item: E) => ReactNode;
  renderCard?: (item: E) => ReactNode;
  columnStyle?: (columnId: string) => DataTableColumnStyle;
  store: BaseDataViewStore<E>;
  totals?: RecordGroupSummaryResult[];
  view: DataViewView;
};

export const DataViewContent = observer(function DataViewContent<E extends HasId>({
  columns,
  onRowClick,
  rowHref,
  rowActions,
  renderCard,
  columnStyle,
  store,
  totals,
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
        columnStyle={columnStyle}
        columns={resolvedColumns}
        rowActions={rowActions}
        store={store}
        totals={totals}
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
