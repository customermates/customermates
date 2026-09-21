"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import type { ReactNode } from "react";

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useContext, useId } from "react";

import { cn } from "@/core/utils/cn";
import { useEntityDetailPersonalization } from "./entity-detail-personalization";
import { resolveDetailFieldOrder } from "./entity-detail-personalization.utils";

type Field = { id: string; content: ReactNode };

const SortableFieldContext = createContext<ReturnType<typeof useSortable> | null>(null);

function SortableField({ id, content }: Field) {
  const { enabled, isPersonalizing } = useEntityDetailPersonalization();
  const sortable = useSortable({ id, disabled: !enabled || !isPersonalizing });
  const { setNodeRef, transform, transition, isDragging } = sortable;

  return (
    <SortableFieldContext.Provider value={sortable}>
      <div
        ref={setNodeRef}
        className={cn(
          "relative flex min-w-0 flex-col gap-4",
          enabled && isPersonalizing && "pl-7",
          isDragging && "z-10 rounded-md bg-card shadow-md",
        )}
        data-sortable-field={id}
        style={{ transform: CSS.Transform.toString(transform), transition }}
      >
        {content}
      </div>
    </SortableFieldContext.Provider>
  );
}

export function EntityDetailFieldDragHandle({ label }: { label: string }) {
  const t = useTranslations();
  const sortable = useContext(SortableFieldContext);
  const { enabled, isPersonalizing } = useEntityDetailPersonalization();

  if (!sortable || !enabled || !isPersonalizing) return null;

  return (
    <button
      ref={sortable.setActivatorNodeRef}
      {...sortable.attributes}
      {...sortable.listeners}
      data-field-drag-handle
      aria-label={`${t("DataView.dragToReorder")}: ${label}`}
      className="flex size-5 shrink-0 touch-none items-center justify-center rounded text-muted-foreground cursor-grab hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      type="button"
    >
      <GripVertical className="size-3.5" />
    </button>
  );
}

export function EntityDetailFields({ fields }: { fields: Field[] }) {
  const {
    enabled,
    applyFieldVisibility,
    availableFieldIds,
    hiddenFieldIds,
    isPersonalizing,
    fieldOrder,
    reorderFields,
  } = useEntityDetailPersonalization();
  const contextId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const availableFields = fields.filter(
    (field) => !enabled || !availableFieldIds || availableFieldIds.includes(field.id),
  );
  const fieldsById = new Map(availableFields.map((field) => [field.id, field]));
  const orderedIds = resolveDetailFieldOrder(
    availableFields.map((field) => field.id),
    fieldOrder,
  );
  const visibleIds = orderedIds.filter(
    (id) => !enabled || !applyFieldVisibility || isPersonalizing || !hiddenFieldIds.includes(id),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!enabled || !isPersonalizing || !over || active.id === over.id) return;
    const from = orderedIds.indexOf(String(active.id));
    const to = orderedIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(orderedIds, from, to);
    reorderFields(next);
  }

  return (
    <DndContext collisionDetection={closestCenter} id={contextId} sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
        <div className="flex min-w-0 flex-col gap-4" data-detail-field-list="overview">
          {visibleIds.map((id) => (
            <SortableField key={id} content={fieldsById.get(id)?.content} id={id} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
