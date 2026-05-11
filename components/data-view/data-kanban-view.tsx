"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { CustomColumnType } from "@/generated/prisma";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { updateEntityCustomFieldValueAction } from "@/app/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppChip } from "@/components/chip/app-chip";
import type { CustomColumnOption } from "@/features/custom-column/custom-column.schema";
import { KANBAN_EMPTY_GROUP_KEY } from "@/core/base/base-get.schema";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { useApplicationErrorHandler } from "@/components/shared/unexpected-error-toaster";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useNavigateToHref } from "@/components/modal/hooks/use-entity-drawer-stack";
import { DataCardBody } from "./data-card-body";
import { cn } from "@/lib/utils";

type HasCustomFieldValues = HasId & {
  customFieldValues?: Array<{ columnId: string; value: unknown }>;
};

type Props<E extends HasCustomFieldValues> = {
  store: BaseDataViewStore<E>;
  columns: ColumnDef<E>[];
  onCardClick?: (item: E) => void;
  cardHref?: (item: E) => string | undefined;
  renderCard?: (item: E) => ReactNode;
  className?: string;
};

const EMPTY_GROUP_LABEL = "No value";

function getGroupValue<E extends HasId>(
  item: E & { customFieldValues?: Array<{ columnId: string; value: unknown }> },
  groupingColumnId: string,
): string {
  const custom = item.customFieldValues?.find((cfv) => cfv.columnId === groupingColumnId)?.value;
  const raw = custom ?? (item as unknown as Record<string, unknown>)[groupingColumnId];
  if (raw == null || raw === "") return KANBAN_EMPTY_GROUP_KEY;
  if (typeof raw === "object") return JSON.stringify(raw);
  return String(raw);
}

function patchCustomFieldValue<E extends HasCustomFieldValues>(item: E, columnId: string, value: unknown): E {
  const existing = item.customFieldValues ?? [];
  const others = existing.filter((cfv) => cfv.columnId !== columnId);
  const next = value == null ? others : [...others, { columnId, value }];
  return { ...item, customFieldValues: next };
}

function KanbanCard({
  itemId,
  children,
  onClick,
  href,
  className,
}: {
  itemId: string;
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const navigateToHref = useNavigateToHref();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: itemId });

  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <Card
      ref={setNodeRef}
      className={cn(
        "gap-2 py-3 touch-none select-none relative",
        (onClick || href) && !isDragging && "interactive-surface",
        isDragging && "z-50 cursor-grabbing shadow-lg shadow-black/20 ring-1 ring-border/60",
        className,
      )}
      style={style}
      onClick={(e) => {
        if (!isDragging && !transform) onClick?.();
        e.stopPropagation();
      }}
      {...listeners}
      {...attributes}
    >
      {href && !isDragging && (
        <a
          aria-label="Open"
          className="absolute inset-0"
          href={href}
          tabIndex={-1}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
            e.preventDefault();
            if (!onClick) navigateToHref(href);
          }}
        />
      )}

      {children}
    </Card>
  );
}

type LoadMoreAction = { label: string; isLoading: boolean; onClick: () => void };

function KanbanColumn({
  id,
  label,
  count,
  option,
  onHeaderClick,
  loadMore,
  children,
}: {
  id: string;
  label: string;
  count: number;
  option?: CustomColumnOption;
  onHeaderClick?: () => void;
  loadMore?: LoadMoreAction;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id });

  const headerContent = option ? (
    <AppChip size="sm" variant={option.color}>
      <span className="truncate">
        {label}

        <span className="opacity-60 mx-1">·</span>

        <span className="tabular-nums">{count}</span>
      </span>
    </AppChip>
  ) : (
    <span className="text-sm font-medium">
      {label}

      <span className="ml-1 text-xs text-muted-foreground tabular-nums">· {count}</span>
    </span>
  );

  return (
    <div ref={setNodeRef} className="flex w-72 shrink-0 flex-col rounded-lg p-0">
      <div className="sticky top-0 z-10 -mx-2 mb-1 flex items-center gap-2 rounded-t-lg bg-background/80 px-3 py-2 backdrop-blur-md">
        {onHeaderClick ? (
          <button
            className="inline-flex items-center rounded-md cursor-pointer transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
            onClick={onHeaderClick}
          >
            {headerContent}
          </button>
        ) : (
          headerContent
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 min-h-20">{children}</div>

      {loadMore && (
        <div className="my-2">
          <Button
            className="w-full"
            disabled={loadMore.isLoading}
            size="sm"
            type="button"
            variant="ghost"
            onClick={loadMore.onClick}
          >
            {loadMore.label}
          </Button>
        </div>
      )}
    </div>
  );
}

export const DataKanbanView = observer(function DataKanbanView<E extends HasCustomFieldValues>({
  store,
  columns,
  onCardClick,
  cardHref,
  renderCard,
  className,
}: Props<E>) {
  const t = useTranslations("");
  const handleApplicationError = useApplicationErrorHandler();
  const { customColumnModalStore } = useRootStore();
  const groupingColumnId = store.groupingColumnId ?? "";
  const rawGrouping = store.customColumns.find((c) => c.id === groupingColumnId);
  const groupingCustomColumn =
    rawGrouping && rawGrouping.type === CustomColumnType.singleSelect ? rawGrouping : undefined;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const hidden = new Set(store.hiddenColumns);
  const visibleColumns = columns.filter((c) => !hidden.has((c as { id?: string }).id ?? ""));

  const table = useReactTable<E>({
    data: store.items,
    columns: visibleColumns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
  });

  if (!groupingColumnId) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Select a grouping column to see the Kanban view.
      </div>
    );
  }

  const groups = new Map<string, E[]>();

  if (groupingCustomColumn?.options?.options)
    for (const opt of groupingCustomColumn.options.options) groups.set(opt.value, []);

  groups.set(KANBAN_EMPTY_GROUP_KEY, []);

  for (const item of store.items) {
    const key = getGroupValue(item, groupingColumnId);
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }

  const rowsById = new Map(table.getRowModel().rows.map((row) => [row.id, row]));

  async function handleDragEnd(event: DragEndEvent) {
    if (!event.over || !event.active) return;
    const itemId = String(event.active.id);
    const targetGroup = String(event.over.id);
    if (!groupingCustomColumn) {
      toast.error(t("Common.notifications.unexpectedError"));
      return;
    }

    const item = store.items.find((i) => i.id === itemId);
    if (!item) return;

    const currentValue = getGroupValue(item, groupingColumnId);
    if (currentValue === targetGroup) return;

    const nextValue = targetGroup === KANBAN_EMPTY_GROUP_KEY ? null : targetGroup;

    const optimisticItem = patchCustomFieldValue(item, groupingColumnId, nextValue);
    store.upsertItemLocal(optimisticItem);
    store.transferItemBetweenGroups(currentValue, targetGroup);

    const revert = () => {
      store.upsertItemLocal(item);
      store.transferItemBetweenGroups(targetGroup, currentValue);
    };

    try {
      const result = await updateEntityCustomFieldValueAction({
        entityType: groupingCustomColumn.entityType,
        entityId: itemId,
        customFieldValues: [{ columnId: groupingColumnId, value: nextValue }],
      });
      if (result?.ok) await store.upsertItem(result.data as unknown as E);
      else {
        revert();
        toastZodErrorTree(result?.error);
      }
    } catch (err) {
      revert();
      handleApplicationError(err);
    }
  }

  if (groups.size === 0) return <div className="py-12 text-center text-sm text-muted-foreground">No items found.</div>;

  const loadMoreLabel = t("Common.actions.loadMore");

  return (
    <DndContext sensors={sensors} onDragEnd={(event) => void handleDragEnd(event)}>
      <div className={cn("flex flex-col overflow-x-auto", className)} data-slot="kanban-root">
        <div className="flex min-w-max flex-1 items-stretch gap-4 px-4">
          {Array.from(groups.entries()).map(([key, items]) => {
            const option = groupingCustomColumn?.options?.options.find((o) => o.value === key);
            const label = key === KANBAN_EMPTY_GROUP_KEY ? EMPTY_GROUP_LABEL : (option?.label ?? key);
            const total = store.groupCounts?.[key] ?? items.length;
            const loadMore =
              total > items.length
                ? { label: loadMoreLabel, isLoading: store.isRefreshing, onClick: () => store.loadMoreInGroup(key) }
                : undefined;
            return (
              <KanbanColumn
                key={key}
                count={total}
                id={key}
                label={label}
                loadMore={loadMore}
                option={option}
                onHeaderClick={
                  groupingCustomColumn ? () => customColumnModalStore.openWithColumn(groupingCustomColumn) : undefined
                }
              >
                {items.map((item) => {
                  const row = rowsById.get(item.id);
                  return (
                    <KanbanCard
                      key={item.id}
                      href={cardHref?.(item)}
                      itemId={item.id}
                      onClick={onCardClick ? () => onCardClick(item) : undefined}
                    >
                      <CardContent className="px-3">
                        {renderCard ? renderCard(item) : row ? <DataCardBody row={row} /> : null}
                      </CardContent>
                    </KanbanCard>
                  );
                })}
              </KanbanColumn>
            );
          })}
        </div>
      </div>
    </DndContext>
  );
});
