"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { ColumnDef, SortingState, VisibilityState } from "@tanstack/react-table";
import type { KeyboardEvent, PointerEvent } from "react";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

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
  className?: string;
  onRowClick?: (item: E) => void;
  onRowHref?: (item: E) => string | undefined;
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
  onRowHref,
}: Props<E>) {
  const t = useTranslations();
  const navigateToHref = useNavigateToHref();
  const [resizeSession, setResizeSession] = useState<ColumnResizeSession>();
  const activeResizeRef = useRef<{
    handle: HTMLButtonElement;
    session: ColumnResizeSession;
  }>();
  const lastTouchTapRef = useRef<{ columnId: string; at: number }>();

  function resetColumnWidth(columnId: string) {
    store.setViewOptions({
      columnWidths: withoutColumnWidth(store.columnWidths, columnId),
    });
  }

  const getColumnWidth = (columnId: string) =>
    resizeSession?.columnId === columnId ? resizeSession.currentWidth : store.columnWidths[columnId];

  const cancelActiveResize = useCallback(() => {
    const active = activeResizeRef.current;
    if (!active) return;

    activeResizeRef.current = undefined;
    setResizeSession(undefined);
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

  function onResizePointerDown(event: PointerEvent<HTMLButtonElement>, columnId: string) {
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
    setResizeSession(session);
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onResizePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const active = activeResizeRef.current;
    if (!active || active.session.pointerId !== event.pointerId) return;

    event.preventDefault();
    const session = updateColumnResize(active.session, event.clientX);
    active.session = session;
    setResizeSession(session);
  }

  function onResizePointerUp(event: PointerEvent<HTMLButtonElement>) {
    const active = activeResizeRef.current;
    if (!active || active.session.pointerId !== event.pointerId) return;

    event.stopPropagation();
    const session = updateColumnResize(active.session, event.clientX);
    cancelActiveResize();

    if (shouldCommitColumnResize(session)) {
      lastTouchTapRef.current = undefined;
      store.setViewOptions({
        columnWidth: { uid: session.columnId, width: session.currentWidth },
      });
      return;
    }

    if (session.pointerType !== "touch" || session.hasMoved) return;
    const previousTap = lastTouchTapRef.current;
    if (previousTap?.columnId === session.columnId && isTouchResetDoubleTap(previousTap.at, event.timeStamp)) {
      lastTouchTapRef.current = undefined;
      resetColumnWidth(session.columnId);
      return;
    }

    lastTouchTapRef.current = {
      columnId: session.columnId,
      at: event.timeStamp,
    };
  }

  function onResizeKeyDown(event: KeyboardEvent<HTMLButtonElement>, columnId: string) {
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
  }
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
            aria-label={t("DataView.selectRow", { id: row.index + 1 })}
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
    [store, t],
  );

  const canBulkAct = Boolean(store.entityType);
  const allColumns = useMemo(
    () => (canBulkAct ? [selectionColumn, ...columns] : columns),
    [canBulkAct, selectionColumn, columns],
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

  return (
    <Table className={className}>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const columnId = header.column.id;
              const isSelectionCol = columnId === "__select";
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
                    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
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
                    <button
                      aria-keyshortcuts="ArrowLeft ArrowRight Home Enter Space"
                      aria-label={t("DataView.resizeColumn", {
                        column: accessibleColumnLabel,
                      })}
                      className="group/resize-handle absolute inset-y-0 right-0 z-10 flex w-3 translate-x-1/2 cursor-col-resize touch-none select-none justify-center border-0 bg-transparent p-0 opacity-0 outline-none group-hover/resize-header:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-foreground/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background data-[state=resizing]:opacity-100 any-pointer-coarse:w-6 any-pointer-coarse:opacity-100"
                      data-slot="column-resize-handle"
                      data-state={isResizing ? "resizing" : undefined}
                      title={t("DataView.resizeHint")}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (event.detail === 0) resetColumnWidth(columnId);
                      }}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        resetColumnWidth(columnId);
                      }}
                      onKeyDown={(event) => onResizeKeyDown(event, columnId)}
                      onLostPointerCapture={cancelActiveResize}
                      onPointerCancel={cancelActiveResize}
                      onPointerDown={(event) => onResizePointerDown(event, columnId)}
                      onPointerMove={onResizePointerMove}
                      onPointerUp={onResizePointerUp}
                    >
                      <span
                        aria-hidden="true"
                        className="w-0.5 rounded-full bg-foreground/45 transition-colors group-hover/resize-handle:bg-foreground/70 group-focus-visible/resize-handle:bg-foreground/70 group-data-[state=resizing]/resize-handle:bg-foreground/70"
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
                  const columnId = cell.column.id;
                  const isSelectionCell = columnId === "__select";
                  const isNameCell = columnId === "name";
                  const liveWidth = getColumnWidth(columnId);
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
            ))}
      </TableBody>
    </Table>
  );
});
