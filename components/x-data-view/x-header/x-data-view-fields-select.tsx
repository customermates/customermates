"use client";

import type { DragEndEvent } from "@dnd-kit/core";

import { Bars2Icon, EyeIcon } from "@heroicons/react/24/outline";
import { Popover, PopoverTrigger } from "@heroui/popover";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { observer } from "mobx-react-lite";
import { useState, useRef } from "react";
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { XBadge } from "../../x-badge";
import { XIcon } from "../../x-icon";
import { XCheckbox } from "../../x-inputs/x-checkbox";
import { XPopoverContent } from "../../x-popover/x-popover-content";
import { useXDataView } from "../x-data-view-container";

type SortableColumnItemProps = {
  isVisible: boolean;
  label: string;
  onCheckboxChange: (uid: string, isSelected: boolean) => void;
  uid: string;
};

function SortableColumnItem({ isVisible, label, onCheckboxChange, uid }: SortableColumnItemProps) {
  const isNameColumn = uid === "name";
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: uid,
    disabled: isNameColumn,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} className="flex items-center gap-2 overflow-hidden justify-between p-2" style={style}>
      <XCheckbox
        classNames={{ base: "max-w-full overflow-hidden", label: "truncate" }}
        id={`column-${uid}`}
        isDisabled={isNameColumn}
        isSelected={isVisible}
        onValueChange={(checked) => onCheckboxChange(uid, checked)}
      >
        {label}
      </XCheckbox>

      {!isNameColumn && (
        <div
          className="cursor-move flex items-center text-default-400 hover:text-default-600"
          {...attributes}
          {...listeners}
        >
          <XIcon className="w-5 h-5 text-subdued" icon={Bars2Icon} />
        </div>
      )}
    </div>
  );
}

export const XDataViewFieldsSelect = observer(() => {
  const store = useXDataView();
  const t = useTranslations("Common");
  const allColumnUids = store.orderedColumns.map((col) => col.uid);
  const nameColumnIndex = allColumnUids.indexOf("name");
  const orderedColumnUids =
    nameColumnIndex > 0 ? ["name", ...allColumnUids.filter((uid) => uid !== "name")] : allColumnUids;
  const visibleColumnUids = store.headerColumns.map((col) => col.uid);

  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId === "name") return;

    const oldIndex = orderedColumnUids.indexOf(activeId);
    let newIndex = orderedColumnUids.indexOf(overId);

    if (overId === "name") newIndex = 1;

    if (oldIndex !== -1 && newIndex !== -1) {
      const reordered = arrayMove(orderedColumnUids, oldIndex, newIndex);
      const newOrder = reordered.filter((uid) => uid !== "name");
      store.setViewOptions({ columnOrder: newOrder });
    }
  }

  function handleCheckboxChange(uid: string, isSelected: boolean) {
    const currentSelection = new Set(visibleColumnUids);

    if (isSelected) currentSelection.add(uid);
    else currentSelection.delete(uid);

    const hiddenColumns = orderedColumnUids.filter((uid) => !currentSelection.has(uid));
    store.setViewOptions({ hiddenColumns });
  }

  return (
    <Popover ref={popoverRef} isOpen={isOpen} placement="bottom-end" onOpenChange={setIsOpen}>
      <XBadge borderColor="content1" content={store.visibleColumnsCount}>
        <PopoverTrigger>
          <Button isIconOnly size="sm" variant="flat">
            <XIcon icon={EyeIcon} />
          </Button>
        </PopoverTrigger>
      </XBadge>

      <XPopoverContent isOpen={isOpen} popoverRef={popoverRef} onClose={() => setIsOpen(false)}>
        <div className="min-w-40">
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedColumnUids} strategy={verticalListSortingStrategy}>
              {orderedColumnUids.map((uid) => {
                const column = store.columnsDefinition.find((col) => col.uid === uid);

                if (!column) return null;

                const label = column.label || t(`table.columns.${column.uid}`);
                const isVisible = visibleColumnUids.includes(uid);

                return (
                  <SortableColumnItem
                    key={uid}
                    isVisible={isVisible}
                    label={label}
                    uid={uid}
                    onCheckboxChange={handleCheckboxChange}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </div>
      </XPopoverContent>
    </Popover>
  );
});
