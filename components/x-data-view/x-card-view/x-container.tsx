"use client";

import type { HasId } from "@/core/base/base-data-view.store";
import type React from "react";
import type { CustomColumnOption } from "@/features/custom-column/custom-column.schema";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@heroui/theme";

import { useXDataView } from "../x-data-view-container";

import { XDataCard } from "./x-data-card";
import { useStickyChip } from "./hooks/use-sticky-chip";

import { XClickableChip } from "@/components/x-chip/x-clickable-chip";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props<E extends HasId> = {
  id: string;
  items: string[];
  option: CustomColumnOption;
  renderCell: (item: E, columnKey: React.Key) => string | number | React.JSX.Element;
  storeItems: E[];
  isDragDisabled?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onCardAction?: (item: E) => void;
};

function SortableItem<E extends HasId>({
  id,
  item,
  renderCell,
  isDragDisabled,
  onCardAction,
}: {
  id: string;
  item: E;
  renderCell: (item: E, columnKey: React.Key) => string | number | React.JSX.Element;
  isDragDisabled?: boolean;
  onCardAction?: (item: E) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: isDragDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      ref={setNodeRef}
      style={style}
      {...(isDragDisabled ? {} : { ...attributes, ...listeners })}
      className={cn(
        "transition-transform motion-reduce:transition-none active:scale-[0.97]",
        isDragDisabled ? "cursor-pointer" : "cursor-move",
      )}
      tabIndex={-1}
      onClick={onCardAction ? () => onCardAction(item) : undefined}
    >
      <XDataCard className="w-full" item={item} renderCell={renderCell} />
    </div>
  );
}

export function XContainer<E extends HasId>({
  id,
  items,
  option,
  renderCell,
  storeItems,
  isDragDisabled,
  isFirst,
  isLast,
  onCardAction,
}: Props<E>) {
  const { setNodeRef } = useDroppable({
    id,
  });

  const store = useXDataView<E>();
  const { xCustomColumnModalStore } = useRootStore();
  const { chipRef, isSticky } = useStickyChip();

  const itemsMap = new Map(storeItems.map((item) => [item.id, item]));
  const containerItems = items.map((itemId) => itemsMap.get(itemId)).filter((item): item is E => item !== undefined);

  function handleChipClick() {
    if (!store.groupingColumnId) return;

    const column = store.customColumns.find((col) => col.id === store.groupingColumnId);
    if (!column) return;

    xCustomColumnModalStore.openWithColumn(column);
  }

  const containerContent = (
    <div ref={setNodeRef} className="flex flex-col gap-6 w-[300px]">
      <div
        ref={chipRef}
        className={cn(
          "flex items-center justify-between border-t border-b border-transparent -m-2 p-2 w-[calc(100%+1.5rem)]",
          {
            "rounded-l-lg border-l": isFirst,
            "rounded-r-lg border-r": isLast,
            "sticky z-30 bg-content1/80 backdrop-blur-lg transition-all duration-300 border-divider": isSticky,
          },
        )}
      >
        <XClickableChip
          color={option.color}
          onClick={handleChipClick}
        >{`${option.label} (${items.length})`}</XClickableChip>
      </div>

      {containerItems.map((item) => (
        <SortableItem
          key={item.id}
          id={item.id}
          isDragDisabled={isDragDisabled}
          item={item}
          renderCell={renderCell}
          onCardAction={onCardAction}
        />
      ))}
    </div>
  );

  if (items.length === 0) return containerContent;

  return (
    <SortableContext id={id} items={items} strategy={verticalListSortingStrategy}>
      {containerContent}
    </SortableContext>
  );
}
