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
import { useTranslations } from "next-intl";
import { Layers } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { AppChip } from "@/components/chip/app-chip";
import type { CustomColumnOption } from "@/features/custom-column/custom-column.schema";
import type { GroupValueSums } from "@/core/base/base-get.schema";
import { KANBAN_EMPTY_GROUP_KEY } from "@/core/base/base-get.schema";
import { DEAL_GROUP_SUM_FIELDS } from "@/features/deals/deal-weighting";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import type { EntityType } from "@/generated/prisma";

import { useColumnLabel } from "@/components/entity-terminology/use-column-label";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { useNavigateToHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { DataCardBody } from "./data-card-body";
import {
  DATA_KANBAN_CARDS_CLASS_NAME,
  DATA_KANBAN_COLUMN_CLASS_NAME,
  DATA_KANBAN_HEADER_CLASS_NAME,
  DATA_KANBAN_ROOT_CLASS_NAME,
  DATA_KANBAN_TRACK_CLASS_NAME,
} from "./data-view-geometry";
import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";

type HasCustomFieldValues = HasId & {
  customFieldValues?: Array<{ columnId: string; value: unknown }>;
};

type Props<E extends HasCustomFieldValues> = {
  store: BaseDataViewStore<E>;
  columns: ColumnDef<E>[];
  onCardClick?: (item: E) => void;
  cardHref?: (item: E) => string | undefined;
  className?: string;
};

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
  const t = useTranslations();
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
          aria-label={t("Common.actions.open")}
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

type LoadMoreAction = {
  label: string;
  isLoading: boolean;
  onClick: () => void;
};

const KanbanColumn = observer(function KanbanColumn({
  id,
  label,
  count,
  valueSums,
  option,
  entityType,
  onHeaderClick,
  loadMore,
  children,
}: {
  id: string;
  label: string;
  count: number;
  valueSums?: GroupValueSums;
  option?: CustomColumnOption;
  entityType?: EntityType;
  onHeaderClick?: () => void;
  loadMore?: LoadMoreAction;
  children: ReactNode;
}) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const columnLabel = useColumnLabel();
  const { singular, plural } = useEntityTerminology();
  const { setNodeRef } = useDroppable({ id });

  const formatSum = (amount: number) =>
    intlStore.formatCurrency(amount, undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

  const totalSum = valueSums?.[DEAL_GROUP_SUM_FIELDS.total];
  const weightedSum = valueSums?.[DEAL_GROUP_SUM_FIELDS.weighted];

  const countLabel = entityType ? `${count} ${count === 1 ? singular(entityType) : plural(entityType)}` : String(count);
  const rateLabel = t("Common.stageProbability");

  const headerContent = option ? (
    <AppChip size="sm" variant={option.color}>
      <span className="truncate">{label}</span>
    </AppChip>
  ) : (
    <span className="text-sm font-medium">{label}</span>
  );

  return (
    <div ref={setNodeRef} className={DATA_KANBAN_COLUMN_CLASS_NAME}>
      <div className={DATA_KANBAN_HEADER_CLASS_NAME}>
        {onHeaderClick ? (
          <button
            className="inline-flex items-center rounded-md cursor-pointer transition-[background-color,transform] hover:bg-accent active:scale-[0.97] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
            onClick={onHeaderClick}
          >
            {headerContent}
          </button>
        ) : (
          headerContent
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
              <Layers aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />

              {count}
            </span>
          </TooltipTrigger>

          <TooltipContent>{countLabel}</TooltipContent>
        </Tooltip>

        {option?.weight !== undefined && weightedSum !== undefined && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground tabular-nums">{option.weight}%</span>
            </TooltipTrigger>

            <TooltipContent>{rateLabel}</TooltipContent>
          </Tooltip>
        )}

        {totalSum !== undefined && (
          <span className="ml-auto flex min-w-0 shrink items-baseline gap-1 text-xs text-muted-foreground tabular-nums">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="truncate opacity-65">{formatSum(totalSum)}</span>
              </TooltipTrigger>

              <TooltipContent>{columnLabel(DEAL_GROUP_SUM_FIELDS.total)}</TooltipContent>
            </Tooltip>

            {weightedSum !== undefined && (
              <>
                <span className="shrink-0 opacity-50">→</span>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="truncate text-foreground">{formatSum(weightedSum)}</span>
                  </TooltipTrigger>

                  <TooltipContent>{columnLabel(DEAL_GROUP_SUM_FIELDS.weighted)}</TooltipContent>
                </Tooltip>
              </>
            )}
          </span>
        )}
      </div>

      <div className={DATA_KANBAN_CARDS_CLASS_NAME}>{children}</div>

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
});

export const DataKanbanView = observer(function DataKanbanView<E extends HasCustomFieldValues>({
  store,
  columns,
  onCardClick,
  cardHref,
  className,
}: Props<E>) {
  const t = useTranslations();
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

  if (!groupingColumnId)
    return <div className="py-8 text-center text-sm text-muted-foreground">{t("DataView.selectGroupingColumn")}</div>;

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

  function projectValueSumsForGroup(item: E, groupKey: string): GroupValueSums | undefined {
    const total = (item as { totalValue?: unknown }).totalValue;
    if (typeof total !== "number") return undefined;

    const weight = groupingCustomColumn?.options?.options?.find((opt) => opt.value === groupKey)?.weight;

    return weight === undefined
      ? { [DEAL_GROUP_SUM_FIELDS.total]: total }
      : {
          [DEAL_GROUP_SUM_FIELDS.total]: total,
          [DEAL_GROUP_SUM_FIELDS.weighted]: (total * weight) / 100,
        };
  }

  async function handleDragEnd(event: DragEndEvent) {
    if (!event.over || !event.active) return;
    const itemId = String(event.active.id);
    const targetGroup = String(event.over.id);

    const item = store.items.find((i) => i.id === itemId);
    if (!item) return;

    const currentValue = getGroupValue(item, groupingColumnId);
    if (currentValue === targetGroup) return;

    const nextValue = targetGroup === KANBAN_EMPTY_GROUP_KEY ? null : targetGroup;

    await store.moveItemBetweenGroups({
      item,
      optimisticItem: patchCustomFieldValue(item, groupingColumnId, nextValue),
      columnId: groupingColumnId,
      fromGroupKey: currentValue,
      toGroupKey: targetGroup,
      value: nextValue,
      destinationValueSums: projectValueSumsForGroup(item, targetGroup),
    });
  }

  if (groups.size === 0) return null;

  const loadMoreLabel = t("Common.actions.loadMore");

  return (
    <DndContext sensors={sensors} onDragEnd={(event) => runUserAction(() => handleDragEnd(event))}>
      <div className={cn(DATA_KANBAN_ROOT_CLASS_NAME, className)} data-slot="kanban-root">
        <div className={DATA_KANBAN_TRACK_CLASS_NAME}>
          {Array.from(groups.entries()).map(([key, items]) => {
            const option = groupingCustomColumn?.options?.options.find((o) => o.value === key);
            const label =
              key === KANBAN_EMPTY_GROUP_KEY
                ? t("DataView.noValue")
                : (option?.label ?? t("Common.inputs.unavailableSelection"));
            const total = store.groupCounts?.[key] ?? items.length;
            const loadMore =
              total > items.length
                ? {
                    label: loadMoreLabel,
                    isLoading: store.isRefreshing,
                    onClick: () => store.loadMoreInGroup(key),
                  }
                : undefined;
            return (
              <KanbanColumn
                key={key}
                count={total}
                entityType={store.entityType}
                id={key}
                label={label}
                loadMore={loadMore}
                option={option}
                valueSums={store.groupValueSums?.[key]}
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
                      <CardContent className="px-3">{row ? <DataCardBody row={row} /> : null}</CardContent>
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
