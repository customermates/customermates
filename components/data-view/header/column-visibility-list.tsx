"use client";

import type { DragEndEvent } from "@dnd-kit/core";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/core/utils/cn";

export type ColumnVisibilityItem = {
  uid: string;
  label: string;
  isVisible: boolean;
  isPinned: boolean;
};

type Props = {
  items: ColumnVisibilityItem[];
  idPrefix?: string;
  onToggle: (uid: string, visible: boolean) => void;
  onReorder: (uids: string[]) => void;
};

function ColumnVisibilityRow({
  item,
  idPrefix,
  onToggle,
}: {
  item: ColumnVisibilityItem;
  idPrefix: string;
  onToggle: (visible: boolean) => void;
}) {
  const t = useTranslations();
  const { uid, label, isVisible, isPinned } = item;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: uid,
    disabled: isPinned,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center gap-2 rounded-md p-1 text-sm hover:bg-accent",
        isDragging && "bg-accent shadow-md",
      )}
      style={style}
    >
      <button
        aria-label={t("DataView.dragToReorder")}
        className={cn(
          "flex h-6 w-4 shrink-0 items-center justify-center rounded text-muted-foreground",
          isPinned
            ? "opacity-20 cursor-not-allowed"
            : "cursor-grab transition-[color,background-color,transform] hover:bg-accent hover:text-foreground active:scale-[0.97] active:cursor-grabbing motion-reduce:transition-none",
        )}
        disabled={isPinned}
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>

      <Label
        className="flex flex-1 items-center gap-2 font-normal cursor-pointer min-w-0"
        htmlFor={`${idPrefix}-${uid}`}
      >
        <Checkbox
          checked={isVisible}
          disabled={isPinned}
          id={`${idPrefix}-${uid}`}
          onCheckedChange={(checked) => onToggle(checked === true)}
        />

        <span className="truncate">{label}</span>
      </Label>
    </div>
  );
}

export function ColumnVisibilityList({ items, idPrefix = "field", onToggle, onReorder }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = items.map((item) => item.uid);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder(arrayMove(ids, from, to));
  }

  return (
    <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((item) => item.uid)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-0.5">
          {items.map((item) => (
            <ColumnVisibilityRow
              key={item.uid}
              idPrefix={idPrefix}
              item={item}
              onToggle={(visible) => onToggle(item.uid, visible)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
