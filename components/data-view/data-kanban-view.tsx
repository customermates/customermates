"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { useId, useRef, useState } from "react";

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Layers } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChipColor } from "@/constants/chip-colors";
import { NO_VALUE_GROUP_KEY } from "@/core/base/grouping/grouping.schema";

import { useNavigateToHref } from "@/components/shared/use-navigate-to-href";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";
import { isInteractiveClick } from "./is-interactive-click";
import type { RecordGroupSummaryResult } from "@/features/records/record-grouping.schema";
import { BoardGroupingPrompt } from "./board-grouping-prompt";
import { ColumnResizeHandle } from "./column-resize-handle";
import { clampWidth, withoutColumnWidth, type ColumnResizeSession } from "./data-table-resize";
import { BOARD_LANE_WIDTH_KEY } from "@/core/data-view/data-view-state.schema";
import {
  DATA_KANBAN_CARDS_CLASS_NAME,
  DATA_KANBAN_COLUMN_CLASS_NAME,
  DATA_KANBAN_HEADER_CLASS_NAME,
  DATA_KANBAN_LANE_WIDTH_BOUNDS,
  DATA_KANBAN_ROOT_CLASS_NAME,
  DATA_KANBAN_TRACK_CLASS_NAME,
} from "./data-view-geometry";
import { useGroupLabel, visibleGroups } from "./group-label";
import { GroupSummaries } from "./group-summaries";
import { kanbanKeyboardCoordinates } from "./kanban-keyboard-coordinates";

type HasCustomFieldValues = HasId & {
  customFieldValues?: Array<{ columnId: string; value: unknown }>;
};

type Props<E extends HasCustomFieldValues> = {
  store: BaseDataViewStore<E>;
  renderCard: (item: E) => ReactNode;
  onCardClick?: (item: E) => void;
  cardHref?: (item: E) => string | undefined;
  cardActions?: (item: E) => ReactNode;
  className?: string;
};

const KANBAN_KEYBOARD_CODES = { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] };

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
  actions,
  className,
}: {
  itemId: string;
  groupKey: string;
  draggable: boolean;
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  actions?: ReactNode;
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
  const { onKeyDown: dragKeyDown, onPointerDown: dragPointerDown } = (listeners ?? {}) as {
    onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
    onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
  };

  return (
    <Card
      ref={setNodeRef}
      className={cn(
        "group/card gap-2 py-3 touch-none select-none relative",
        (onClick || href) && !isDragging && "interactive-surface",
        isDragging && "z-50 cursor-grabbing shadow-lg ring-1 ring-border/60",
        className,
      )}
      data-item-id={itemId}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        if (!e.currentTarget.contains(e.target as Node) || isInteractiveClick(e) || isDragging || transform) return;
        if (onClick) onClick();
        else if (href && !(e.metaKey || e.ctrlKey || e.shiftKey)) navigateToHref(href);
      }}
      onKeyDown={(event) => {
        const opens =
          (onClick || href) &&
          event.target === event.currentTarget &&
          !isDragging &&
          (event.key === "Enter" || (!draggable && event.key === " "));
        if (!opens) {
          if (draggable && event.target === event.currentTarget) dragKeyDown?.(event);
          return;
        }
        event.preventDefault();
        if (onClick) onClick();
        else if (href) navigateToHref(href);
      }}
      onPointerDown={(event) => {
        if (draggable && event.currentTarget.contains(event.target as Node)) dragPointerDown?.(event);
      }}
      {...(draggable ? attributes : onClick || href ? { role: "button", tabIndex: 0 } : {})}
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

      <div className="relative">{children}</div>

      {actions && (
        <div className="absolute top-2 right-2 z-10" onPointerDown={(event) => event.stopPropagation()}>
          {actions}
        </div>
      )}
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
  summaries,
  color,
  weight,
  droppable,
  recordLabels,
  loadMore,
  width,
  resizeHandle,
  children,
}: {
  id: string;
  label: string;
  count: number;
  summaries?: RecordGroupSummaryResult[];
  color?: ChipColor;
  weight?: number;
  droppable: boolean;
  recordLabels?: { singular: string; plural: string };
  loadMore?: LoadMoreAction;
  width?: number;
  resizeHandle?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations();
  const { setNodeRef } = useDroppable({ id, disabled: !droppable });

  const countLabel = recordLabels
    ? t("DataView.kanbanCount", { count, singular: recordLabels.singular, plural: recordLabels.plural })
    : String(count);
  const rateLabel = t("Common.stageProbability");

  const headerContent = color ? (
    <AppChip size="sm" variant={color}>
      {label}
    </AppChip>
  ) : (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="min-w-0 truncate text-sm font-medium">{label}</span>
      </TooltipTrigger>

      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <div
      ref={setNodeRef}
      className={DATA_KANBAN_COLUMN_CLASS_NAME}
      data-group-key={id}
      style={width === undefined ? undefined : { width }}
    >
      <div className={DATA_KANBAN_HEADER_CLASS_NAME}>
        {headerContent}

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
              <Layers aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />

              {count}
            </span>
          </TooltipTrigger>

          <TooltipContent>{countLabel}</TooltipContent>
        </Tooltip>

        {weight !== undefined && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{weight}%</span>
            </TooltipTrigger>

            <TooltipContent>{rateLabel}</TooltipContent>
          </Tooltip>
        )}

        {summaries?.length ? <GroupSummaries compact summaries={summaries} /> : null}
      </div>

      {resizeHandle}

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
  renderCard,
  onCardClick,
  cardHref,
  cardActions,
  className,
}: Props<E>) {
  const t = useTranslations();
  const dndContextId = useId();
  const boardRef = useRef<HTMLDivElement>(null);
  const groupLabel = useGroupLabel(store.groupingResult);
  const supportsDragWriteBack = store.groupingResult?.supportsDragWriteBack ?? false;
  const writeBackColumnId = store.groupingResult?.columnId;
  const [laneResize, setLaneResize] = useState<ColumnResizeSession>();
  const storedLaneWidth = store.columnWidths[BOARD_LANE_WIDTH_KEY];
  const laneWidth =
    laneResize?.currentWidth ??
    (storedLaneWidth === undefined ? undefined : clampWidth(storedLaneWidth, DATA_KANBAN_LANE_WIDTH_BOUNDS));

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 4 },
  });
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: kanbanKeyboardCoordinates,
    keyboardCodes: KANBAN_KEYBOARD_CODES,
  });
  const sensors = useSensors(
    supportsDragWriteBack ? pointerSensor : null,
    supportsDragWriteBack ? keyboardSensor : null,
  );

  const groups = visibleGroups(store.groupingResult, { keepEmptyNoValue: true });

  if (!store.isGrouped) {
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col", className)} data-slot="kanban-root">
        <BoardGroupingPrompt store={store} />
      </div>
    );
  }

  const itemsById = new Map(store.items.map((item) => [item.id, item]));

  async function handleDragEnd(event: DragEndEvent) {
    if (!supportsDragWriteBack || !writeBackColumnId) return;
    if (!event.over || !event.active) return;

    const itemId = String(event.active.id);
    const targetGroup = String(event.over.id);
    const fromGroupKey = String(event.active.data.current?.groupKey ?? "");
    const destination = groups.find((group) => group.key === targetGroup);
    if (!destination || destination.writable === false) return;

    const item = itemsById.get(itemId);
    if (
      !item ||
      store.canMoveItemBetweenGroups?.(item) === false ||
      fromGroupKey === "" ||
      fromGroupKey === targetGroup
    )
      return;

    const nextValue = targetGroup === NO_VALUE_GROUP_KEY ? null : targetGroup;

    await store.moveItemBetweenGroups({
      item,
      optimisticItem: patchCustomFieldValue(item, writeBackColumnId, nextValue),
      fromGroupKey,
      toGroupKey: targetGroup,
      value: nextValue,
    });
    if (event.activatorEvent instanceof KeyboardEvent) {
      requestAnimationFrame(() => {
        const focused = document.activeElement;
        if (focused && focused !== document.body && focused.getAttribute("data-item-id") !== itemId) return;
        const card = boardRef.current?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(itemId)}"]`);
        (card ?? boardRef.current)?.focus({ preventScroll: true });
      });
    }
  }

  const loadMoreLabel = t("Common.actions.loadMore");
  const overflow = store.groupingResult?.overflow;
  const destinationLabel = (id: string | number) => {
    const group = groups.find((group) => group.key === String(id));
    return group ? groupLabel(group) : t("Common.inputs.unavailableSelection");
  };

  return (
    <DndContext
      accessibility={{
        screenReaderInstructions: {
          draggable: t("DataView.boardKeyboardInstructions"),
        },
        announcements: {
          onDragStart: () => t("DataView.boardPickedUp"),
          onDragOver: ({ over }) =>
            over
              ? t("DataView.boardMoveTarget", {
                  group: destinationLabel(over.id),
                })
              : undefined,
          onDragEnd: ({ over }) =>
            over
              ? t("DataView.boardMoveRequested", {
                  group: destinationLabel(over.id),
                })
              : t("DataView.boardMoveCancelled"),
          onDragCancel: () => t("DataView.boardMoveCancelled"),
        },
      }}
      id={dndContextId}
      sensors={sensors}
      onDragEnd={(event) => runUserAction(() => handleDragEnd(event))}
    >
      <div ref={boardRef} className={cn(DATA_KANBAN_ROOT_CLASS_NAME, className)} data-slot="kanban-root" tabIndex={-1}>
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
                droppable={supportsDragWriteBack && group.writable !== false}
                id={group.key}
                label={groupLabel(group)}
                loadMore={loadMore}
                recordLabels={store.recordLabels}
                resizeHandle={
                  <ColumnResizeHandle
                    bounds={DATA_KANBAN_LANE_WIDTH_BOUNDS}
                    className="-right-2 hover:opacity-100"
                    columnId={BOARD_LANE_WIDTH_KEY}
                    label={t("DataView.resizeBoardColumns")}
                    measure={(handle) => handle.parentElement?.getBoundingClientRect().width}
                    resizing={laneResize !== undefined}
                    onCommit={(width) => store.setViewOptions({ columnWidth: { uid: BOARD_LANE_WIDTH_KEY, width } })}
                    onLiveWidth={setLaneResize}
                    onReset={() =>
                      store.setViewOptions({
                        columnWidths: withoutColumnWidth(store.columnWidths, BOARD_LANE_WIDTH_KEY),
                      })
                    }
                  />
                }
                summaries={group.summaries}
                weight={group.weight}
                width={laneWidth}
              >
                {group.itemIds.map((itemId) => {
                  const item = itemsById.get(itemId);
                  if (!item) return null;

                  return (
                    <KanbanCard
                      key={itemId}
                      actions={cardActions?.(item)}
                      draggable={supportsDragWriteBack && store.canMoveItemBetweenGroups?.(item) !== false}
                      groupKey={group.key}
                      href={cardHref?.(item)}
                      itemId={itemId}
                      onClick={onCardClick ? () => onCardClick(item) : undefined}
                    >
                      <CardContent className="px-3">{renderCard(item)}</CardContent>
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
