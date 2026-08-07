"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { ColumnDef, ColumnSizingState, SortingState, VisibilityState } from "@tanstack/react-table";
import type { KeyboardEvent, PointerEvent } from "react";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigateToHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import type { Prisma } from "@/generated/prisma";
import { cn } from "@/core/utils/cn";

import { isInteractiveClick } from "./is-interactive-click";
import {
  beginColumnResize,
  columnResizeLabel,
  isTouchResetDoubleTap,
  keyboardColumnWidth,
  MIN_COLUMN_WIDTH,
  shouldCommitColumnResize,
  updateColumnResize,
  withoutColumnWidth,
  type ColumnResizeSession,
} from "./data-table-resize";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  columns: ColumnDef<E>[];
  onRowClick?: (item: E) => void;
  onRowHref?: (item: E) => string | undefined;
};

type ResizeDraft = {
  columnId: string;
  width: number;
};

type ActiveResize = {
  handle: HTMLButtonElement;
  session: ColumnResizeSession;
};

type LastTouchTap = {
  columnId: string;
  at: number;
};

export const DataTable = observer(function DataTable<E extends HasId>({
  store,
  columns,
  onRowClick,
  onRowHref,
}: Props<E>) {
  const navigateToHref = useNavigateToHref();
  const [resizeDraft, setResizeDraft] = useState<ResizeDraft>();
  const activeResizeRef = useRef<ActiveResize | undefined>(undefined);
  const lastTouchTapRef = useRef<LastTouchTap | undefined>(undefined);

  const resetColumnWidth = useCallback(
    (columnId: string) => {
      store.setViewOptions({
        columnWidths: withoutColumnWidth(store.columnWidths, columnId),
      });
    },
    [store],
  );

  const cancelActiveResize = useCallback(() => {
    const active = activeResizeRef.current;
    if (!active) return;

    activeResizeRef.current = undefined;
    setResizeDraft(undefined);
    if (active.handle.hasPointerCapture(active.session.pointerId))
      active.handle.releasePointerCapture(active.session.pointerId);
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") cancelActiveResize();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") cancelActiveResize();
    };

    window.addEventListener("blur", cancelActiveResize);
    window.addEventListener("resize", cancelActiveResize);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", cancelActiveResize);
      window.removeEventListener("resize", cancelActiveResize);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [cancelActiveResize]);

  const onResizePointerDown = useCallback((event: PointerEvent<HTMLButtonElement>, columnId: string) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;

    const headerCell = event.currentTarget.closest("th");
    if (!headerCell) return;

    event.stopPropagation();
    const session = beginColumnResize({
      columnId,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      clientX: event.clientX,
      renderedWidth: headerCell.getBoundingClientRect().width,
    });

    activeResizeRef.current = { handle: event.currentTarget, session };
    setResizeDraft({ columnId, width: session.currentWidth });
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onResizePointerMove = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const active = activeResizeRef.current;
    if (!active || active.session.pointerId !== event.pointerId) return;

    event.preventDefault();
    const session = updateColumnResize(active.session, event.clientX);
    activeResizeRef.current = { ...active, session };
    setResizeDraft({
      columnId: session.columnId,
      width: session.currentWidth,
    });
  }, []);

  const onResizePointerUp = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const active = activeResizeRef.current;
      if (!active || active.session.pointerId !== event.pointerId) return;

      event.stopPropagation();
      const session = updateColumnResize(active.session, event.clientX);
      activeResizeRef.current = undefined;
      setResizeDraft(undefined);
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);

      if (shouldCommitColumnResize(session)) {
        lastTouchTapRef.current = undefined;
        store.setViewOptions({
          columnWidth: { uid: session.columnId, width: session.currentWidth },
        });
        return;
      }

      if (session.pointerType !== "touch") return;
      const previousTap = lastTouchTapRef.current;
      if (previousTap?.columnId === session.columnId && isTouchResetDoubleTap(previousTap.at, event.timeStamp)) {
        lastTouchTapRef.current = undefined;
        resetColumnWidth(session.columnId);
      } else {
        lastTouchTapRef.current = {
          columnId: session.columnId,
          at: event.timeStamp,
        };
      }
    },
    [resetColumnWidth, store],
  );

  const onResizeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, columnId: string) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        resetColumnWidth(columnId);
        return;
      }

      const headerCell = event.currentTarget.closest("th");
      if (!headerCell) return;
      const width = keyboardColumnWidth(headerCell.getBoundingClientRect().width, event.key, event.shiftKey);
      if (width === undefined) return;

      event.preventDefault();
      store.setViewOptions({ columnWidth: { uid: columnId, width } });
    },
    [resetColumnWidth, store],
  );
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

  const columnSizing: ColumnSizingState = useMemo(() => ({ ...store.columnWidths }), [store.columnWidths]);

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
        if (!store.isItemSelectable(row.original)) return null;

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
              const liveWidth = resizeDraft?.columnId === header.column.id ? resizeDraft.width : persistedWidth;
              const accessibleColumnLabel = columnResizeLabel(
                header.column.id,
                header.column.columnDef.header,
                store.columnsDefinition.find((column) => column.uid === header.column.id)?.label,
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
                      ? {
                          width: liveWidth,
                          minWidth: liveWidth,
                          maxWidth: liveWidth,
                        }
                      : canResize
                        ? { minWidth: MIN_COLUMN_WIDTH }
                        : undefined
                  }
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
                            store.setQueryOptions({
                              sortDescriptor: {
                                field: fieldId,
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
                    <button
                      aria-keyshortcuts="ArrowLeft ArrowRight Home Enter Space"
                      aria-label={`Resize ${accessibleColumnLabel} column. Drag or use arrow keys to resize; double-tap or press Enter to reset.`}
                      className={cn(
                        "group/resize-handle absolute right-0 top-0 z-10 flex h-full w-3 translate-x-1/2 cursor-col-resize touch-none select-none items-stretch justify-center border-0 bg-transparent p-0 opacity-0 outline-none",
                        "group-hover/resize-header:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                        resizeDraft?.columnId === header.column.id && "opacity-100",
                        "[@media(any-pointer:coarse)]:w-6 [@media(any-pointer:coarse)]:opacity-100",
                      )}
                      data-slot="column-resize-handle"
                      data-state={resizeDraft?.columnId === header.column.id ? "resizing" : undefined}
                      title="Drag to resize. Double-click, double-tap, or press Enter to reset."
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (event.detail === 0) resetColumnWidth(header.column.id);
                      }}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        resetColumnWidth(header.column.id);
                      }}
                      onKeyDown={(event) => onResizeKeyDown(event, header.column.id)}
                      onLostPointerCapture={cancelActiveResize}
                      onPointerCancel={cancelActiveResize}
                      onPointerDown={(event) => onResizePointerDown(event, header.column.id)}
                      onPointerMove={onResizePointerMove}
                      onPointerUp={onResizePointerUp}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "w-px bg-border transition-colors",
                          "group-hover/resize-header:bg-primary/60 group-focus-visible/resize-handle:bg-primary",
                          resizeDraft?.columnId === header.column.id && "w-0.5 bg-primary",
                          "[@media(any-pointer:coarse)]:bg-primary/60",
                        )}
                        data-slot="column-resize-indicator"
                      />
                    </button>
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>

      <TableBody>
        {table.getRowModel().rows.length === 0
          ? null
          : table.getRowModel().rows.map((row) => (
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
                  const liveWidth = resizeDraft?.columnId === cell.column.id ? resizeDraft.width : persistedWidth;
                  const content = flexRender(cell.column.columnDef.cell, cell.getContext());
                  const rowHref = onRowHref?.(row.original);
                  const wrapped =
                    isNameCell && rowHref ? (
                      <a
                        className="block truncate text-inherit [&:hover_span:not([data-slot])]:underline"
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
                    <TableCell
                      key={cell.id}
                      className={isSelectionCell ? "w-10" : undefined}
                      style={
                        liveWidth != null && !isSelectionCell
                          ? {
                              width: liveWidth,
                              minWidth: liveWidth,
                              maxWidth: liveWidth,
                            }
                          : undefined
                      }
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
            ))}
      </TableBody>
    </Table>
  );
});
