"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { Fragment, useId, useRef, useState } from "react";

import {
  DndContext,
  DragOverlay,
  type Active,
  type ClientRect,
  type DragEndEvent,
  type Over,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { ChevronsLeftRight, Ellipsis } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  DATA_KANBAN_CARDS_CLASS_NAME,
  DATA_KANBAN_COLUMN_CLASS_NAME,
  DATA_KANBAN_HEADER_CLASS_NAME,
  DATA_KANBAN_ROOT_CLASS_NAME,
  DATA_KANBAN_STRIP_CLASS_NAME,
  DATA_KANBAN_TRACK_CLASS_NAME,
} from "./data-view-geometry";
import { useGroupLabel, visibleGroups } from "./group-label";
import { GroupSummaries } from "./group-summaries";
import { kanbanKeyboardCoordinates, kanbanManualKeyboardCoordinates } from "./kanban-keyboard-coordinates";

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
  dropTarget,
  hidden,
  children,
  onClick,
  href,
  actions,
  className,
}: {
  itemId: string;
  groupKey: string;
  draggable: boolean;
  dropTarget: boolean;
  hidden: boolean;
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  actions?: ReactNode;
  className?: string;
}) {
  const t = useTranslations();
  const navigateToHref = useNavigateToHref();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: itemId,
    data: { groupKey },
    disabled: !draggable,
  });
  const drop = useDroppable({ id: `card:${itemId}`, data: { groupKey, itemId }, disabled: !dropTarget });
  const { onKeyDown: dragKeyDown, onPointerDown: dragPointerDown } = (listeners ?? {}) as {
    onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
    onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
  };

  return (
    <Card
      ref={(node: HTMLDivElement | null) => {
        setNodeRef(node);
        drop.setNodeRef(node);
      }}
      className={cn(
        "group/card gap-2 py-3 select-none relative",
        draggable && "touch-manipulation",
        (onClick || href) && !isDragging && "interactive-surface",
        hidden && "hidden",
        className,
      )}
      data-item-id={itemId}
      onClick={(e) => {
        e.stopPropagation();
        if (!e.currentTarget.contains(e.target as Node) || isInteractiveClick(e) || isDragging) return;
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

function KanbanColumnLabel({ label, color }: { label: string; color?: ChipColor }) {
  return color ? (
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
}

function KanbanCount({
  count,
  recordLabels,
  details = [],
}: {
  count: number;
  recordLabels?: { singular: string; plural: string };
  details?: string[];
}) {
  const t = useTranslations();
  const countLabel = [
    recordLabels
      ? t("DataView.kanbanCount", { count, singular: recordLabels.singular, plural: recordLabels.plural })
      : String(count),
    ...details,
  ].join(", ");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span aria-label={countLabel} className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {count}
        </span>
      </TooltipTrigger>

      <TooltipContent>{countLabel}</TooltipContent>
    </Tooltip>
  );
}

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
  highlighted,
  onCollapse,
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
  highlighted: boolean;
  onCollapse: () => void;
  children: ReactNode;
}) {
  const t = useTranslations();
  const { setNodeRef } = useDroppable({ id, disabled: !droppable });
  const moreLabel = t("RecordModel.moreActions", { name: label });
  const details = weight === undefined ? [] : [`${t("Common.stageProbability")}: ${weight}%`];

  return (
    <div
      ref={setNodeRef}
      className={cn(DATA_KANBAN_COLUMN_CLASS_NAME, "transition-colors", highlighted && "bg-accent/40")}
      data-drop-target={highlighted ? "" : undefined}
      data-group-key={id}
    >
      <div className={cn(DATA_KANBAN_HEADER_CLASS_NAME, "group/header")}>
        <KanbanColumnLabel color={color} label={label} />

        <KanbanCount count={count} details={summaries?.length ? [] : details} recordLabels={recordLabels} />

        {summaries?.length ? (
          <GroupSummaries lead details={details} summaries={summaries} />
        ) : (
          <span className="ml-auto" />
        )}

        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/header:opacity-100 focus-within:opacity-100 has-data-[state=open]:opacity-100 any-pointer-coarse:opacity-100">
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button aria-label={moreLabel} className="text-muted-foreground" size="icon-xs" variant="ghost">
                    <Ellipsis aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>

              <TooltipContent>{moreLabel}</TooltipContent>
            </Tooltip>

            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onCollapse}>
                <ChevronsLeftRight className="size-4" />

                {t("DataView.collapseColumn")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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

const KanbanStrip = observer(function KanbanStrip({
  id,
  label,
  color,
  count,
  droppable,
  recordLabels,
  onExpand,
}: {
  id: string;
  label: string;
  color?: ChipColor;
  count: number;
  droppable: boolean;
  recordLabels?: { singular: string; plural: string };
  onExpand: () => void;
}) {
  const t = useTranslations();
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !droppable });
  const expandLabel = t("DataView.expandColumn", { name: label });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={setNodeRef}
          aria-label={expandLabel}
          className={cn(DATA_KANBAN_STRIP_CLASS_NAME, isOver && "bg-accent ring-2 ring-ring/40")}
          data-group-key={id}
          data-kanban-strip=""
          type="button"
          onClick={onExpand}
        >
          <span className="flex min-h-0 items-center gap-2 [writing-mode:vertical-rl]">
            <KanbanColumnLabel color={color} label={label} />

            <KanbanCount count={count} recordLabels={recordLabels} />
          </span>
        </button>
      </TooltipTrigger>

      <TooltipContent>{expandLabel}</TooltipContent>
    </Tooltip>
  );
});

type DropTarget = { groupKey: string; beforeId: string | null };

function isBelow(translated: ClientRect | null, target: ClientRect) {
  return translated !== null && translated.top + translated.height / 2 > target.top + target.height / 2;
}

function KanbanPlaceholder({ height }: { height: number }) {
  return (
    <div
      aria-hidden
      className="shrink-0 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5"
      data-kanban-placeholder=""
      style={{ height: Math.max(height, 48) }}
    />
  );
}

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

  const manualOrder = store.manualOrderActive;
  const [drag, setDrag] = useState<{ itemId: string; fromGroupKey: string; height: number } | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 4 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 6 },
  });
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: manualOrder ? kanbanManualKeyboardCoordinates : kanbanKeyboardCoordinates,
    keyboardCodes: KANBAN_KEYBOARD_CODES,
  });
  const sensors = useSensors(
    supportsDragWriteBack ? mouseSensor : null,
    supportsDragWriteBack ? touchSensor : null,
    supportsDragWriteBack ? keyboardSensor : null,
  );

  const groups = visibleGroups(store.groupingResult, { keepEmptyNoValue: true });
  const openGroups = groups.filter((group) => !store.isGroupCollapsed(group.key));
  const collapsedGroups = groups.filter((group) => store.isGroupCollapsed(group.key));

  if (!store.isGrouped) {
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col", className)} data-slot="kanban-root">
        <BoardGroupingPrompt store={store} />
      </div>
    );
  }

  const itemsById = new Map(store.items.map((item) => [item.id, item]));

  function nextOf(itemId: string, groupKey: string): string | null {
    const ids = groups.find((group) => group.key === groupKey)?.itemIds ?? [];
    const index = ids.indexOf(itemId);
    return index < 0 ? null : (ids[index + 1] ?? null);
  }

  function resolveTarget(active: Active, over: Over | null): DropTarget | null {
    if (!over) return null;
    const activeId = String(active.id);
    const fromGroupKey = String(active.data.current?.groupKey ?? "");
    const data = over.data.current as { groupKey?: string; itemId?: string } | undefined;
    const groupKey = data?.groupKey ?? String(over.id);
    const group = groups.find((candidate) => candidate.key === groupKey);
    if (!group) return null;
    const ids = group.itemIds.filter((id) => id !== activeId);
    if (!manualOrder) return { groupKey, beforeId: groupKey === fromGroupKey ? nextOf(activeId, groupKey) : null };
    if (data?.itemId === activeId) return { groupKey, beforeId: nextOf(activeId, groupKey) };
    if (!data?.itemId) return { groupKey, beforeId: null };
    const index = ids.indexOf(data.itemId);
    return {
      groupKey,
      beforeId: isBelow(active.rect.current.translated, over.rect) ? (ids[index + 1] ?? null) : data.itemId,
    };
  }

  function updateTarget(active: Active, over: Over | null) {
    const next = resolveTarget(active, over);
    if (next?.groupKey !== target?.groupKey || next?.beforeId !== target?.beforeId) setTarget(next);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const resolved = event.active ? resolveTarget(event.active, event.over) : null;
    setDrag(null);
    setTarget(null);
    if (!supportsDragWriteBack || !writeBackColumnId || !resolved) return;

    const itemId = String(event.active.id);
    const fromGroupKey = String(event.active.data.current?.groupKey ?? "");
    const destination = groups.find((group) => group.key === resolved.groupKey);
    if (!destination || destination.writable === false) return;

    const item = itemsById.get(itemId);
    if (!item || store.canMoveItemBetweenGroups?.(item) === false || fromGroupKey === "") return;
    const sameGroup = fromGroupKey === resolved.groupKey;
    const ids = destination.itemIds.filter((id) => id !== itemId);
    const beforeIndex = resolved.beforeId ? ids.indexOf(resolved.beforeId) : ids.length;
    if (sameGroup && (!manualOrder || nextOf(itemId, fromGroupKey) === resolved.beforeId)) return;

    const nextValue = resolved.groupKey === NO_VALUE_GROUP_KEY ? null : resolved.groupKey;

    await store.moveItemBetweenGroups({
      item,
      optimisticItem: patchCustomFieldValue(item, writeBackColumnId, nextValue),
      fromGroupKey,
      toGroupKey: resolved.groupKey,
      value: nextValue,
      ...(manualOrder ? { afterId: ids[beforeIndex - 1] ?? null, beforeId: resolved.beforeId } : {}),
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

  const placement =
    drag === null
      ? null
      : (target ?? { groupKey: drag.fromGroupKey, beforeId: nextOf(drag.itemId, drag.fromGroupKey) });
  const dragged = drag ? itemsById.get(drag.itemId) : undefined;
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
      onDragCancel={() => {
        setDrag(null);
        setTarget(null);
      }}
      onDragEnd={(event) => runUserAction(() => handleDragEnd(event))}
      onDragMove={(event) => updateTarget(event.active, event.over)}
      onDragOver={(event) => updateTarget(event.active, event.over)}
      onDragStart={(event) => {
        setDrag({
          itemId: String(event.active.id),
          fromGroupKey: String(event.active.data.current?.groupKey ?? ""),
          height: event.active.rect.current.initial?.height ?? 0,
        });
        setTarget(null);
      }}
    >
      <div ref={boardRef} className={cn(DATA_KANBAN_ROOT_CLASS_NAME, className)} data-slot="kanban-root" tabIndex={-1}>
        <div className={DATA_KANBAN_TRACK_CLASS_NAME}>
          {openGroups.map((group) => {
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
                highlighted={drag !== null && placement?.groupKey === group.key}
                id={group.key}
                label={groupLabel(group)}
                loadMore={loadMore}
                recordLabels={store.recordLabels}
                summaries={group.summaries}
                weight={group.weight}
                onCollapse={() => store.toggleGroupCollapsed(group.key)}
              >
                {group.itemIds.map((itemId) => {
                  const item = itemsById.get(itemId);
                  if (!item) return null;

                  return (
                    <Fragment key={itemId}>
                      {placement?.groupKey === group.key && placement.beforeId === itemId && (
                        <KanbanPlaceholder height={drag?.height ?? 0} />
                      )}

                      <KanbanCard
                        actions={cardActions?.(item)}
                        draggable={supportsDragWriteBack && store.canMoveItemBetweenGroups?.(item) !== false}
                        dropTarget={supportsDragWriteBack && manualOrder && group.writable !== false}
                        groupKey={group.key}
                        hidden={drag?.itemId === itemId}
                        href={cardHref?.(item)}
                        itemId={itemId}
                        onClick={onCardClick ? () => onCardClick(item) : undefined}
                      >
                        <CardContent className="px-3">{renderCard(item)}</CardContent>
                      </KanbanCard>
                    </Fragment>
                  );
                })}

                {placement?.groupKey === group.key && placement.beforeId === null && (
                  <KanbanPlaceholder height={drag?.height ?? 0} />
                )}
              </KanbanColumn>
            );
          })}

          {collapsedGroups.map((group) => (
            <KanbanStrip
              key={group.key}
              color={group.color}
              count={group.count}
              droppable={supportsDragWriteBack && group.writable !== false}
              id={group.key}
              label={groupLabel(group)}
              recordLabels={store.recordLabels}
              onExpand={() => store.toggleGroupCollapsed(group.key)}
            />
          ))}
        </div>

        {overflow && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {t("DataView.groupOverflow", { count: overflow.shown })}
          </p>
        )}
      </div>

      <DragOverlay>
        {dragged ? (
          <Card className="cursor-grabbing gap-2 py-3 shadow-xl ring-1 ring-border/60 rotate-1 motion-reduce:rotate-0">
            <CardContent className="px-3">{renderCard(dragged)}</CardContent>
          </Card>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
});
