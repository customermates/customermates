"use client";

import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import type { HasId } from "@/core/base/base-data-view.store";
import type { CustomColumnOption } from "@/features/custom-column/custom-column.schema";
import type { CustomFieldValueDto } from "@/core/base/base-entity.schema";

import { useState, useMemo, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { toJS } from "mobx";
import { CustomColumnType } from "@/generated/prisma";

import { useXDataView } from "../x-data-view-container";

import { XDataCard } from "./x-data-card";
import { XContainer } from "./x-container";

import { updateEntityCustomFieldValueAction } from "@/app/actions";
import { useIsTouchDevice } from "@/core/utils/use-is-touch-device";

type ItemsState = Record<string, string[]>;

type ItemWithOptionalCustomFieldValues = HasId & {
  customFieldValues?: Array<{ columnId: string; value: string | null }>;
};

type Props<E extends ItemWithOptionalCustomFieldValues> = {
  renderCell: (item: E, columnKey: React.Key) => string | number | React.JSX.Element;
  onCardAction?: (item: E) => void;
};

const UNASSIGNED_CONTAINER_ID = "__unassigned__";

export const XKanbanView = observer(
  <E extends ItemWithOptionalCustomFieldValues>({ renderCell, onCardAction }: Props<E>) => {
    const store = useXDataView<E>();
    const t = useTranslations("Diagrams");
    const isTouchDevice = useIsTouchDevice();
    const [items, setItems] = useState<ItemsState>({});
    const [activeId, setActiveId] = useState<string | undefined>();

    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: {
          distance: 8,
        },
      }),
      useSensor(KeyboardSensor, {
        coordinateGetter: sortableKeyboardCoordinates,
      }),
    );

    const isDragDisabled = store.isDisabled || isTouchDevice;

    const { initialItemsState, optionMap } = useMemo(() => {
      const groupingColumnId = store.groupingColumnId;
      if (!groupingColumnId) return { initialItemsState: {}, optionMap: {} };

      const groupingColumn = store.customColumns.find((col) => col.id === groupingColumnId);
      if (!groupingColumn || groupingColumn.type !== CustomColumnType.singleSelect || !groupingColumn.options?.options)
        return { initialItemsState: {}, optionMap: {} };

      const options = groupingColumn.options.options;
      const containers: ItemsState = {};
      const optionMap: Record<string, CustomColumnOption> = {};

      const hasDefault = options.some((option) => option.isDefault);

      const sortedOptions = [...options].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

      sortedOptions.forEach((option) => {
        containers[option.value] = [];
        optionMap[option.value] = option;
      });

      const hasItemsWithoutValue = store.items.some((item) => {
        const customFieldValue = item.customFieldValues?.find((cfv) => cfv.columnId === groupingColumnId);
        const value = customFieldValue?.value;
        return !value;
      });

      if (!hasDefault || hasItemsWithoutValue) {
        containers[UNASSIGNED_CONTAINER_ID] = [];
        optionMap[UNASSIGNED_CONTAINER_ID] = {
          value: UNASSIGNED_CONTAINER_ID,
          label: t("noGroup"),
          color: "default",
          isDefault: false,
          index: sortedOptions.length,
        };
      }

      store.items.forEach((item) => {
        const customFieldValue = (
          item as { customFieldValues?: Array<{ columnId: string; value: string | null }> }
        ).customFieldValues?.find((cfv) => cfv.columnId === groupingColumnId);

        const value = customFieldValue?.value;
        if (value && value in containers) containers[value].push(item.id);
        else containers[UNASSIGNED_CONTAINER_ID].push(item.id);
      });

      return { initialItemsState: containers, optionMap };
    }, [store.items, store.groupingColumnId, store.customColumns, t]);

    useEffect(() => setItems(initialItemsState), [initialItemsState]);

    function handleDragStart(event: DragStartEvent) {
      const { active } = event;
      const id = String(active.id);
      setActiveId(id);
    }

    function handleDragOver(event: DragOverEvent) {
      const { active, over, delta } = event;
      const id = String(active.id);
      const overId = over ? String(over.id) : undefined;

      if (!overId) return;

      setItems((prev) => {
        const activeContainer = id in prev ? id : Object.keys(prev).find((key) => prev[key].includes(id));
        const overContainer = overId in prev ? overId : Object.keys(prev).find((key) => prev[key].includes(overId));

        if (!activeContainer || !overContainer || activeContainer === overContainer) return prev;

        const activeItems = prev[activeContainer] || [];
        const overItems = prev[overContainer] || [];

        const activeIndex = activeItems.indexOf(id);
        const overIndex = overItems.indexOf(overId);

        let newIndex;
        if (overId in prev) newIndex = overItems.length + 1;
        else {
          const isBelowLastItem = over && overIndex === overItems.length - 1 && delta.y > 0;

          const modifier = isBelowLastItem ? 1 : 0;

          newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
        }

        return {
          ...prev,
          [activeContainer]: [...prev[activeContainer].filter((item) => item !== id)],
          [overContainer]: [
            ...prev[overContainer].slice(0, newIndex),
            activeItems[activeIndex],
            ...prev[overContainer].slice(newIndex, prev[overContainer].length),
          ],
        };
      });
    }

    function handleDragEnd(event: DragEndEvent) {
      const { active, over } = event;
      const id = String(active.id);
      const overId = over ? String(over.id) : undefined;

      if (!overId) {
        setActiveId(undefined);
        return;
      }

      const groupingColumnId = store.groupingColumnId;
      const entityType = store.entityType;
      if (!groupingColumnId || !entityType) {
        setActiveId(undefined);
        return;
      }

      const customFieldValuesRef: CustomFieldValueDto[] = [];

      setItems((currentItems) => {
        const overContainer =
          overId in currentItems ? overId : Object.keys(currentItems).find((key) => currentItems[key].includes(overId));
        const currentContainer =
          id in currentItems ? id : Object.keys(currentItems).find((key) => currentItems[key].includes(id));

        if (!overContainer || !currentContainer) {
          setActiveId(undefined);
          return currentItems;
        }

        const originalItem = store.items.find((item) => item.id === id);
        if (!originalItem) {
          setActiveId(undefined);
          return currentItems;
        }

        const originalItemWithCustomFields = originalItem as {
          customFieldValues?: Array<{ columnId: string; value: string | null }>;
        };
        const originalCustomFieldValue = originalItemWithCustomFields.customFieldValues?.find(
          (cfv) => cfv.columnId === groupingColumnId,
        );
        const originalContainer = originalCustomFieldValue?.value ?? undefined;

        const containerChanged = originalContainer !== overContainer;

        const updatedItems = (() => {
          if (containerChanged && currentContainer !== overContainer) {
            return {
              ...currentItems,
              [currentContainer]: currentItems[currentContainer].filter((itemId) => itemId !== id),
              [overContainer]: [...currentItems[overContainer], id],
            };
          }

          if (!containerChanged && currentContainer === overContainer) {
            const activeIndex = currentItems[currentContainer].indexOf(id);
            const overIndex = currentItems[overContainer].indexOf(overId);

            if (activeIndex !== overIndex) {
              return {
                ...currentItems,
                [overContainer]: arrayMove(currentItems[overContainer], activeIndex, overIndex),
              };
            }
          }

          return currentItems;
        })();

        if (containerChanged) {
          const newValueForItem = overContainer === UNASSIGNED_CONTAINER_ID ? null : overContainer;

          const plainCustomFieldValues = originalItemWithCustomFields.customFieldValues
            ? toJS(originalItemWithCustomFields.customFieldValues)
            : [];

          const hasGroupingColumnValue = plainCustomFieldValues.some((cfv) => cfv.columnId === groupingColumnId);

          const updatedCustomFieldValues = hasGroupingColumnValue
            ? plainCustomFieldValues.map((cfv) =>
                cfv.columnId === groupingColumnId
                  ? { columnId: cfv.columnId, value: newValueForItem }
                  : { columnId: cfv.columnId, value: cfv.value },
              )
            : [...plainCustomFieldValues, { columnId: groupingColumnId, value: newValueForItem }];

          customFieldValuesRef.push(...updatedCustomFieldValues);
        }

        setActiveId(undefined);
        return updatedItems;
      });

      if (customFieldValuesRef.length > 0) {
        void (async () => {
          const result = await updateEntityCustomFieldValueAction({
            entityType,
            entityId: id,
            customFieldValues: customFieldValuesRef,
          });

          if (result.ok) await store.upsertItem(result.data as unknown as E);
        })();
      }
    }

    const containerIds = useMemo(() => {
      const sortedOptionValues = Object.keys(optionMap).sort((a, b) => {
        const optionA = optionMap[a];
        const optionB = optionMap[b];
        if (a === UNASSIGNED_CONTAINER_ID) return -1;
        if (b === UNASSIGNED_CONTAINER_ID) return 1;
        return (optionA.index ?? 0) - (optionB.index ?? 0);
      });
      return sortedOptionValues.filter((id) => id in items);
    }, [items, optionMap]);

    return (
      <div className="flex flex-row gap-6 w-fit">
        <DndContext
          collisionDetection={pointerWithin}
          sensors={isDragDisabled ? [] : sensors}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragStart={handleDragStart}
        >
          {containerIds.map((containerId, index) => (
            <XContainer
              key={containerId}
              id={containerId}
              isDragDisabled={isDragDisabled}
              isFirst={index === 0}
              isLast={index === containerIds.length - 1}
              items={items[containerId] ?? []}
              option={optionMap[containerId]}
              renderCell={renderCell}
              storeItems={store.items}
              onCardAction={onCardAction}
            />
          ))}

          <DragOverlay>
            {activeId
              ? (() => {
                  const activeItem = store.items.find((item) => item.id === activeId);
                  return activeItem ? <XDataCard item={activeItem} renderCell={renderCell} /> : null;
                })()
              : null}
          </DragOverlay>
        </DndContext>
      </div>
    );
  },
);
