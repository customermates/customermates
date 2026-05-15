"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { ColumnDef, ColumnSizingState, SortingState, VisibilityState } from "@tanstack/react-table";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigateToHref } from "@/components/modal/hooks/use-entity-drawer-stack";
import type { Prisma } from "@/generated/prisma";
import { cn } from "@/lib/utils";

import { isInteractiveClick } from "./is-interactive-click";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  columns: ColumnDef<E>[];
  onRowClick?: (item: E) => void;
  onRowHref?: (item: E) => string | undefined;
};

export const DataTable = observer(function DataTable<E extends HasId>({
  store,
  columns,
  onRowClick,
  onRowHref,
}: Props<E>) {
  const navigateToHref = useNavigateToHref();
  const t = useTranslations("Common.table");
  const sorting: SortingState = useMemo(
    () =>
      store.sortDescriptor ? [{ id: store.sortDescriptor.field, desc: store.sortDescriptor.direction === "desc" }] : [],
    [store.sortDescriptor],
  );

  const columnVisibility: VisibilityState = useMemo(() => {
    const visibility: VisibilityState = {};
    for (const uid of store.hiddenColumns) visibility[uid] = false;
    return visibility;
  }, [store.hiddenColumns]);

  const columnSizing: ColumnSizingState = useMemo(() => ({ ...store.columnWidths }), [store.columnWidths]);

  const selectionColumn: ColumnDef<E> = useMemo(
    () => ({
      id: "__select",
      size: 40,
      header: () => {
        const allSelected = store.items.length > 0 && store.items.every((item) => store.selectedIds.has(item.id));
        const someSelected = !allSelected && store.items.some((item) => store.selectedIds.has(item.id));
        return (
          <Checkbox
            aria-label="Select all rows"
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={(checked) => {
              if (checked) store.setSelectedIds("all");
              else store.clearSelection();
            }}
          />
        );
      },
      cell: ({ row }) => {
        const id = row.original.id;
        return (
          <Checkbox
            aria-label={`Select row ${id}`}
            checked={store.selectedIds.has(id)}
            onCheckedChange={(checked) => {
              if (checked) store.selectedIds.add(id);
              else store.selectedIds.delete(id);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        );
      },
    }),
    [store],
  );

  const canBulkAct = Boolean(store.entityType);
  const allColumns = useMemo(
    () => (canBulkAct ? [selectionColumn, ...columns] : columns),
    [canBulkAct, selectionColumn, columns],
  );

  const table = useReactTable<E>({
    data: store.items,
    columns: allColumns,
    state: { sorting, columnVisibility, columnSizing },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    columnResizeMode: "onEnd",
    onColumnSizingChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnSizing) : updater;
      const changed = Object.entries(next).find(([uid, width]) => store.columnWidths[uid] !== width);
      if (changed) {
        const [uid, width] = changed;
        store.setViewOptions({ columnWidth: { uid, width } });
      }
    },
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

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const isSelectionCol = header.column.id === "__select";
              const canSort = header.column.getCanSort() && !isSelectionCol;
              const canResize = header.column.getCanResize() && !isSelectionCol;
              const sorted = header.column.getIsSorted();
              const persistedWidth = store.columnWidths[header.column.id];
              const isResizing = header.column.getIsResizing();
              const deltaOffset = table.getState().columnSizingInfo.deltaOffset ?? 0;
              const liveWidth =
                isResizing && persistedWidth
                  ? Math.max(80, persistedWidth + deltaOffset)
                  : isResizing
                    ? Math.max(80, header.getSize() + deltaOffset)
                    : persistedWidth;
              return (
                <TableHead
                  key={header.id}
                  className={cn("relative", canSort && "cursor-pointer select-none", isSelectionCol && "w-10")}
                  style={liveWidth ? { width: liveWidth, minWidth: liveWidth, maxWidth: liveWidth } : undefined}
                >
                  {header.isPlaceholder ? null : (
                    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                      {canSort ? (
                        <Button
                          className="-ml-2 h-8 min-w-0 shrink justify-start !px-2 font-medium uppercase tracking-wide text-muted-foreground"
                          size="xs"
                          variant="ghost"
                          onClick={() => {
                            const currentField = store.sortDescriptor?.field;
                            const currentDir = store.sortDescriptor?.direction;
                            const fieldId = header.column.id;
                            const nextDirection: Prisma.SortOrder =
                              currentField === fieldId && currentDir === "asc" ? "desc" : "asc";
                            store.setQueryOptions({ sortDescriptor: { field: fieldId, direction: nextDirection } });
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
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none select-none",
                        "hover:bg-primary/40 active:bg-primary",
                        header.column.getIsResizing() && "bg-primary",
                      )}
                      onDoubleClick={() => header.column.resetSize()}
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                    />
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>

      <TableBody>
        {table.getRowModel().rows.length === 0 ? (
          <TableRow>
            <TableCell className="h-24 text-center text-muted-foreground" colSpan={allColumns.length}>
              {t("emptyContent")}
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className={cn((onRowClick || onRowHref) && "cursor-pointer")}
              data-state={store.selectedIds.has(row.original.id) ? "selected" : undefined}
              onClick={(e) => {
                if (isInteractiveClick(e)) return;
                if (store.selectedIds.size > 0 && canBulkAct) {
                  if (store.selectedIds.has(row.original.id)) store.selectedIds.delete(row.original.id);
                  else store.selectedIds.add(row.original.id);
                  return;
                }
                if (onRowClick) {
                  onRowClick(row.original);
                  return;
                }
                const href = onRowHref?.(row.original);
                if (href) navigateToHref(href);
              }}
            >
              {row.getVisibleCells().map((cell) => {
                const isSelectionCell = cell.column.id === "__select";
                const isNameCell = cell.column.id === "name";
                const persistedWidth = store.columnWidths[cell.column.id];
                const content = flexRender(cell.column.columnDef.cell, cell.getContext());
                const rowHref = onRowHref?.(row.original);
                const wrapped =
                  isNameCell && rowHref ? (
                    <a
                      className="block truncate text-inherit hover:underline"
                      href={rowHref}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                        if (store.selectedIds.size > 0 && canBulkAct) {
                          e.preventDefault();
                          return;
                        }
                        e.preventDefault();
                        if (onRowClick) onRowClick(row.original);
                        else navigateToHref(rowHref);
                      }}
                    >
                      {content}
                    </a>
                  ) : (
                    content
                  );
                return (
                  <TableCell key={cell.id} className={isSelectionCell ? "w-10" : undefined}>
                    {persistedWidth != null && !isSelectionCell ? (
                      <div className="truncate" style={{ width: persistedWidth - 24 }}>
                        {wrapped}
                      </div>
                    ) : (
                      wrapped
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
});
