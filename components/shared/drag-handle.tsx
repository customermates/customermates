"use client";

import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";

import { GripVertical } from "lucide-react";

import { cn } from "@/core/utils/cn";

type Props = {
  label: string;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  className?: string;
};

export function DragHandle({ label, attributes, listeners, setActivatorNodeRef, className }: Props) {
  return (
    <button
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={label}
      className={cn(
        "flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing",
        className,
      )}
      type="button"
    >
      <GripVertical aria-hidden="true" className="size-3.5" />
    </button>
  );
}
