"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { ColumnDef, Row, SortingState, VisibilityState } from "@tanstack/react-table";
import type { ReactNode } from "react";
import type { RecordGroupSummaryResult } from "@/features/records/record-grouping.schema";

import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronsUpDown } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Fragment, useMemo, useState } from "react";

import { AppChip } from "@/components/chip/app-chip";
import { useNavigateToHref } from "@/components/shared/use-navigate-to-href";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/core/utils/cn";
import type { Prisma } from "@/generated/prisma";

import { columnResizeLabel, MIN_COLUMN_WIDTH, withoutColumnWidth, type ColumnResizeSession } from "./data-table-resize";
import { ColumnResizeHandle } from "./column-resize-handle";
import { useGroupLabel, visibleGroups } from "./group-label";
import { GroupSummaries } from "./group-summaries";
import { isInteractiveClick } from "./is-interactive-click";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  columns: ColumnDef<E>[];
  className?: string;
  onRowClick?: (item: E) => void;
  rowActions?: (item: E) => ReactNode;
  onRowHref?: (item: E) => string | undefined;
  rowFocusKey?: (item: E) => string | undefined;
  totals?: RecordGroupSummaryResult[];
};

const fixedWidthStyle = (width: number) => ({
  width,
  minWidth: width,
  maxWidth: width,
});

export const DataTable = observer(function DataTable<E extends HasId>({
  store,
  columns,
  className,
  onRowClick,
  rowActions,
  onRowHref,
  rowFocusKey,
  totals,
}: Props<E>) {
  const t = useTranslations();
  const navigateToHref = useNavigateToHref();
  const groupLabel = useGroupLabel(store.groupingResult);
  const [resizeSession, setResizeSession] = useState<ColumnResizeSession>();

  function resetColumnWidth(columnId: string) {
    store.setViewOptions({
      columnWidths: withoutColumnWidth(store.columnWidths, columnId),
    });
  }

  const getColumnWidth = (columnId: string) =>
    resizeSession?.columnId === columnId ? resizeSession.currentWidth : store.columnWidths[columnId];

  const sorting: SortingState = useMemo(
    () =>
      store.sortDescriptor
        ? [
            {
              id: store.sortDescriptor.field,
              desc: store.sortDescriptor.direction === "desc",
            },
          ]
        : [],
    [store.sortDescriptor],
  );

  const columnVisibility: VisibilityState = useMemo(() => {
    const visibility: VisibilityState = {};
    for (const uid of store.hiddenColumns) visibility[uid] = false;
    return visibility;
  }, [store.hiddenColumns]);

  const selectionColumn: ColumnDef<E> = useMemo(
    () => ({
      id: "__select",
      size: 40,
      header: () => {
        const selectable = store.items.filter((item) => store.isItemSelectable(item));
        const allSelected = selectable.length > 0 && selectable.every((item) => store.selectedIds.has(item.id));
        const someSelected = !allSelected && selectable.some((item) => store.selectedIds.has(item.id));
        return (
          <Checkbox
            aria-label={t("DataView.selectAllRows")}
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={(checked) => store.setPageSelection(checked === true)}
          />
        );
      },
      cell: ({ row }) => {
        if (!store.isItemSelectable(row.original)) return null;

        const id = row.original.id;
        return (
          <Checkbox
            aria-label={t("DataView.selectRow", { id: row.index + 1 })}
            checked={store.selectedIds.has(id)}
            onCheckedChange={() => store.toggleItemSelection(id)}
            onClick={(e) => e.stopPropagation()}
          />
        );
      },
    }),
    [store, t],
  );

  const canBulkAct = store.supportsSelection;
  const actionsColumn = useMemo<ColumnDef<E> | null>(
    () =>
      rowActions
        ? {
            id: "__actions",
            header: () => <span className="sr-only">{t("DataView.rowActions")}</span>,
            enableSorting: false,
            enableResizing: false,
            cell: ({ row }) => rowActions(row.original),
          }
        : null,
    [rowActions, t],
  );
  const allColumns = useMemo(
    () => [...(canBulkAct ? [selectionColumn] : []), ...columns, ...(actionsColumn ? [actionsColumn] : [])],
    [canBulkAct, selectionColumn, columns, actionsColumn],
  );

  const table = useReactTable<E>({
    data: store.items,
    columns: allColumns,
    state: { sorting, columnVisibility },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const first = next[0];
      store.setQueryOptions({
        sortDescriptor: first
          ? {
              field: first.id,
              direction: (first.desc ? "desc" : "asc") as Prisma.SortOrder,
            }
          : undefined,
      });
    },
  });

  function renderRow(row: Row<E>): ReactNode {
    return (
      <TableRow
        key={row.id}
        className={cn("group/row", (onRowClick || onRowHref) && "cursor-pointer")}
        data-focus-target={rowFocusKey?.(row.original)}
        data-row-id={row.original.id}
        data-state={store.selectedIds.has(row.original.id) ? "selected" : undefined}
        onClick={(e) => {
          if (!e.currentTarget.contains(e.target as Node) || isInteractiveClick(e)) return;
          if (store.selectedIds.size > 0 && canBulkAct) {
            store.toggleItemSelection(row.original.id);
            return;
          }
          if (onRowClick) {
            e.currentTarget.querySelector<HTMLElement>('[data-slot="data-row-open"]')?.focus({ preventScroll: true });
            onRowClick(row.original);
            return;
          }
          const href = onRowHref?.(row.original);
          if (href) navigateToHref(href);
        }}
      >
        {row.getVisibleCells().map((cell) => {
          const columnId = cell.column.id;
          const isSelectionCell = columnId === "__select" || columnId === "__actions";
          const isNameCell = columnId === (store.primaryColumnId ?? store.columnsDefinition[0]?.uid);
          const liveWidth = getColumnWidth(columnId);
          const content = flexRender(cell.column.columnDef.cell, cell.getContext());
          const rowHref = onRowHref?.(row.original);
          const wrapped =
            isNameCell && rowHref ? (
              <a
                className="block truncate text-inherit [&:hover_span:not([data-slot])]:underline"
                data-slot="data-row-open"
                href={rowHref}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                  if (store.selectedIds.size > 0 && canBulkAct) {
                    e.preventDefault();
                    return;
                  }
                  e.preventDefault();
                  if (onRowClick) {
                    e.currentTarget.focus({ preventScroll: true });
                    onRowClick(row.original);
                  } else navigateToHref(rowHref);
                }}
              >
                {content}
              </a>
            ) : isNameCell && onRowClick ? (
              <button
                className="block w-full truncate rounded-sm text-left text-inherit outline-none [&:hover_span:not([data-slot])]:underline focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                data-slot="data-row-open"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (store.selectedIds.size > 0 && canBulkAct) {
                    store.toggleItemSelection(row.original.id);
                    return;
                  }
                  e.currentTarget.focus({ preventScroll: true });
                  onRowClick(row.original);
                }}
              >
                {content}
              </button>
            ) : (
              content
            );
          return (
            <TableCell
              key={cell.id}
              className={
                columnId === "__actions"
                  ? "sticky right-0 w-px py-0 pl-0 whitespace-nowrap any-pointer-coarse:static focus-within:bg-background group-hover/row:bg-background group-hover/row:bg-[image:linear-gradient(var(--accent),var(--accent))] group-data-[state=selected]/row:bg-[image:linear-gradient(var(--selected),var(--selected))]"
                  : isSelectionCell
                    ? "w-10"
                    : undefined
              }
              style={liveWidth != null && !isSelectionCell ? fixedWidthStyle(liveWidth) : undefined}
            >
              {liveWidth != null && !isSelectionCell ? (
                <div className="truncate" style={{ width: Math.max(0, liveWidth - 24) }}>
                  {wrapped}
                </div>
              ) : (
                wrapped
              )}
            </TableCell>
          );
        })}
      </TableRow>
    );
  }

  const rowsById = new Map(table.getRowModel().rows.map((row) => [row.original.id, row]));
  const leafColumnCount = table.getVisibleLeafColumns().length;
  const groups = visibleGroups(store.groupingResult);
  const overflow = store.groupingResult?.overflow;

  return (
    <Table className={className}>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const columnId = header.column.id;
              const isSelectionCol = columnId === "__select" || columnId === "__actions";
              const canSort = header.column.getCanSort() && !isSelectionCol;
              const canResize = header.column.getCanResize() && !isSelectionCol;
              const sorted = header.column.getIsSorted();
              const isResizing = resizeSession?.columnId === columnId;
              const liveWidth = getColumnWidth(columnId);
              const accessibleColumnLabel = columnResizeLabel(
                columnId,
                header.column.columnDef.header,
                store.columnsDefinition.find((column) => column.uid === columnId)?.label,
              );
              return (
                <TableHead
                  key={header.id}
                  className={cn(
                    "relative",
                    canResize && "group/resize-header",
                    canSort && "cursor-pointer select-none",
                    isSelectionCol && "w-10",
                  )}
                  style={
                    liveWidth != null
                      ? fixedWidthStyle(liveWidth)
                      : canResize
                        ? { minWidth: MIN_COLUMN_WIDTH }
                        : undefined
                  }
                >
                  {header.isPlaceholder ? null : (
                    <div className="-ml-2 flex min-w-0 items-center gap-1 overflow-hidden pl-2">
                      {canSort ? (
                        <Button
                          className="-ml-2 h-8 min-w-0 shrink justify-start !px-2 font-medium uppercase tracking-wide text-muted-foreground"
                          size="xs"
                          variant="ghost"
                          onClick={() => {
                            const currentField = store.sortDescriptor?.field;
                            const currentDir = store.sortDescriptor?.direction;
                            const nextDirection: Prisma.SortOrder =
                              currentField === columnId && currentDir === "asc" ? "desc" : "asc";
                            store.setQueryOptions({
                              sortDescriptor: {
                                field: columnId,
                                direction: nextDirection,
                              },
                            });
                          }}
                        >
                          <span className="min-w-0 truncate">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>

                          {sorted === "asc" ? (
                            <ArrowUp className="size-3 shrink-0" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3 shrink-0" />
                          ) : (
                            <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
                          )}
                        </Button>
                      ) : (
                        <span className="min-w-0 truncate">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                      )}
                    </div>
                  )}

                  {canResize && (
                    <ColumnResizeHandle
                      columnId={columnId}
                      label={t("DataView.resizeColumn", { column: accessibleColumnLabel })}
                      measure={(handle) => handle.closest("th")?.getBoundingClientRect().width}
                      resizing={isResizing}
                      onCommit={(width) => store.setViewOptions({ columnWidth: { uid: columnId, width } })}
                      onLiveWidth={setResizeSession}
                      onReset={() => resetColumnWidth(columnId)}
                    />
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>

      <TableBody>
        {!store.isGrouped
          ? table.getRowModel().rows.map(renderRow)
          : groups.map((group) => {
              const collapsed = store.isGroupCollapsed(group.key);
              const label = groupLabel(group);
              const groupRows = group.itemIds.flatMap((id) => {
                const row = rowsById.get(id);
                return row ? [row] : [];
              });
              const selectable = groupRows.filter((row) => store.isItemSelectable(row.original));
              const allSelected =
                selectable.length > 0 && selectable.every((row) => store.selectedIds.has(row.original.id));
              const someSelected = !allSelected && selectable.some((row) => store.selectedIds.has(row.original.id));

              return (
                <Fragment key={group.key}>
                  <TableRow
                    className="bg-muted/40 hover:bg-muted/40 has-aria-expanded:bg-muted/40"
                    data-slot="group-header-row"
                  >
                    <TableCell colSpan={leafColumnCount}>
                      <div className="flex min-w-0 items-center gap-2">
                        {canBulkAct && (
                          <Checkbox
                            aria-label={t("DataView.selectGroup", { group: label })}
                            checked={allSelected ? true : someSelected ? "indeterminate" : false}
                            disabled={selectable.length === 0}
                            onCheckedChange={(checked) => store.setGroupSelection(group.key, checked === true)}
                          />
                        )}

                        <button
                          aria-expanded={!collapsed}
                          aria-label={
                            collapsed
                              ? t("DataView.expandGroup", { group: label })
                              : t("DataView.collapseGroup", { group: label })
                          }
                          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          data-slot="group-disclosure"
                          type="button"
                          onClick={() => store.toggleGroupCollapsed(group.key)}
                        >
                          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                        </button>

                        {group.color ? (
                          <AppChip size="sm" variant={group.color}>
                            <span className="truncate">{label}</span>
                          </AppChip>
                        ) : (
                          <span className="min-w-0 truncate text-sm font-medium">{label}</span>
                        )}

                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{group.count}</span>

                        {group.summaries?.length ? <GroupSummaries summaries={group.summaries} /> : null}
                      </div>
                    </TableCell>
                  </TableRow>

                  {!collapsed && groupRows.map(renderRow)}

                  {!collapsed && group.hasMore && (
                    <TableRow data-slot="group-load-more">
                      <TableCell colSpan={leafColumnCount}>
                        <Button
                          disabled={store.isRefreshing}
                          size="sm"
                          type="button"
                          variant="ghost"
                          onClick={() => store.loadMoreInGroup(group.key)}
                        >
                          {t("Common.actions.loadMore")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}

        {store.isGrouped && overflow && (
          <TableRow data-slot="group-overflow">
            <TableCell className="text-xs text-muted-foreground" colSpan={leafColumnCount}>
              {t("DataView.groupOverflow", { count: overflow.shown })}
            </TableCell>
          </TableRow>
        )}
      </TableBody>

      {totals?.length ? (
        <TableFooter data-slot="table-totals">
          <TableRow className="hover:bg-transparent">
            {table.getVisibleLeafColumns().map((column) => {
              const summaries = totals.filter((summary) => summary.fieldId === column.id);
              return (
                <TableCell key={column.id}>
                  {summaries.length ? <GroupSummaries summaries={summaries} /> : null}
                </TableCell>
              );
            })}
          </TableRow>
        </TableFooter>
      ) : null}
    </Table>
  );
});
