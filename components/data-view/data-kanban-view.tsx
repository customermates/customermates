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
import type { ChipColor } from "@/constants/chip-colors";
import type { GroupValueSums } from "@/core/base/base-get.schema";
import { NO_VALUE_GROUP_KEY } from "@/core/base/grouping/grouping.schema";
import { projectValueSumsForGroup } from "@/core/base/grouping/project-value-sums";
import { DEAL_GROUP_SUM_FIELDS } from "@/features/deals/deal-weighting";
import { visibleColumnDefs } from "./visible-column-defs";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import type { EntityType } from "@/generated/prisma";

import { useColumnLabel } from "@/components/entity-terminology/use-column-label";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { useNavigateToHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { DataCardBody } from "./data-card-body";
import { useGroupLabel, visibleGroups } from "./group-label";
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

function patchCustomFieldValue<E extends HasCustomFieldValues>(item: E, columnId: string, value: unknown): E {
  const existing = item.customFieldValues ?? [];
  const others = existing.filter((cfv) => cfv.columnId !== columnId);
  const next = value == null ? others : [...others, { columnId, value }];
  return { ...item, customFieldValues: next };
}

function KanbanCard({
  itemId,
  groupKey,
  draggable,
  children,
  onClick,
  href,
  className,
}: {
  itemId: string;
  groupKey: string;
  draggable: boolean;
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const t = useTranslations();
  const navigateToHref = useNavigateToHref();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: itemId,
    data: { groupKey },
    disabled: !draggable,
  });

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
  color,
  weight,
  droppable,
  entityType,
  onHeaderClick,
  loadMore,
  children,
}: {
  id: string;
  label: string;
  count: number;
  valueSums?: GroupValueSums;
  color?: ChipColor;
  weight?: number;
  droppable: boolean;
  entityType?: EntityType;
  onHeaderClick?: () => void;
  loadMore?: LoadMoreAction;
  children: ReactNode;
}) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const columnLabel = useColumnLabel();
  const { singular, plural } = useEntityTerminology();
  const { setNodeRef } = useDroppable({ id, disabled: !droppable });

  const formatSum = (amount: number) =>
    intlStore.formatCurrency(amount, undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

  const totalSum = valueSums?.[DEAL_GROUP_SUM_FIELDS.total];
  const weightedSum = valueSums?.[DEAL_GROUP_SUM_FIELDS.weighted];

  const countLabel = entityType ? `${count} ${count === 1 ? singular(entityType) : plural(entityType)}` : String(count);
  const rateLabel = t("Common.stageProbability");

  const headerContent = color ? (
    <AppChip size="sm" variant={color}>
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

        {weight !== undefined && weightedSum !== undefined && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground tabular-nums">{weight}%</span>
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
  const groupLabel = useGroupLabel(store.groupingResult);
  const supportsDragWriteBack = store.groupingResult?.supportsDragWriteBack ?? false;
  const writeBackColumnId = store.groupingResult?.columnId;
  const editableColumn = store.customColumns.find(
    (column) => column.id === writeBackColumnId && column.type === CustomColumnType.singleSelect,
  );

  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 4 } });
  const sensors = useSensors(supportsDragWriteBack ? pointerSensor : null);

  const visibleColumns = visibleColumnDefs(columns, store.hiddenColumns);

  const table = useReactTable<E>({
    data: store.items,
    columns: visibleColumns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
  });

  const groups = visibleGroups(store.groupingResult, { keepEmptyNoValue: true });

  if (!store.isGrouped)
    return <div className="py-8 text-center text-sm text-muted-foreground">{t("DataView.selectGroupingColumn")}</div>;

  const rowsById = new Map(table.getRowModel().rows.map((row) => [row.id, row]));
  const itemsById = new Map(store.items.map((item) => [item.id, item]));

  async function handleDragEnd(event: DragEndEvent) {
    if (!supportsDragWriteBack || !writeBackColumnId) return;
    if (!event.over || !event.active) return;

    const itemId = String(event.active.id);
    const targetGroup = String(event.over.id);
    const fromGroupKey = String(event.active.data.current?.groupKey ?? "");

    const item = itemsById.get(itemId);
    if (!item || fromGroupKey === "" || fromGroupKey === targetGroup) return;

    const nextValue = targetGroup === NO_VALUE_GROUP_KEY ? null : targetGroup;
    const weight = groups.find((group) => group.key === targetGroup)?.weight;

    await store.moveItemBetweenGroups({
      item,
      optimisticItem: patchCustomFieldValue(item, writeBackColumnId, nextValue),
      fromGroupKey,
      toGroupKey: targetGroup,
      value: nextValue,
      destinationValueSums: projectValueSumsForGroup(item, weight),
    });
  }

  const loadMoreLabel = t("Common.actions.loadMore");
  const overflow = store.groupingResult?.overflow;

  return (
    <DndContext sensors={sensors} onDragEnd={(event) => runUserAction(() => handleDragEnd(event))}>
      <div className={cn(DATA_KANBAN_ROOT_CLASS_NAME, className)} data-slot="kanban-root">
        <div className={DATA_KANBAN_TRACK_CLASS_NAME}>
          {groups.map((group) => {
            const loadMore = group.hasMore
              ? {
                  label: loadMoreLabel,
                  isLoading: store.isRefreshing,
                  onClick: () => store.loadMoreInGroup(group.key),
                }
              : undefined;

            return (
              <KanbanColumn
                key={group.key}
                color={group.color}
                count={group.count}
                droppable={supportsDragWriteBack}
                entityType={store.entityType}
                id={group.key}
                label={groupLabel(group)}
                loadMore={loadMore}
                valueSums={group.valueSums}
                weight={group.weight}
                onHeaderClick={editableColumn ? () => customColumnModalStore.openWithColumn(editableColumn) : undefined}
              >
                {group.itemIds.map((itemId) => {
                  const item = itemsById.get(itemId);
                  const row = rowsById.get(itemId);
                  if (!item) return null;

                  return (
                    <KanbanCard
                      key={itemId}
                      draggable={supportsDragWriteBack}
                      groupKey={group.key}
                      href={cardHref?.(item)}
                      itemId={itemId}
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

        {overflow && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {t("DataView.groupOverflow", { count: overflow.shown })}
          </p>
        )}
      </div>
    </DndContext>
  );
});
