"use client";

import type { ComponentProps } from "react";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";

import { GripVertical } from "lucide-react";

import { ITEM_REVEAL_CLASS } from "@/components/ui/item-actions";
import { cn } from "@/core/utils/cn";

type Props = Omit<ComponentProps<"button">, "ref" | "type" | "aria-label"> & {
  label: string;
  attributes?: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  setActivatorNodeRef?: (element: HTMLElement | null) => void;
  reveal?: boolean;
};

export function DragHandle({
  label,
  attributes,
  listeners,
  setActivatorNodeRef,
  reveal = false,
  className,
  ...props
}: Props) {
  return (
    <button
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      {...props}
      aria-label={label}
      className={cn(
        "flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-20 disabled:hover:bg-transparent",
        reveal && ITEM_REVEAL_CLASS,
        className,
      )}
      type="button"
    >
      <GripVertical aria-hidden="true" className="size-3.5" />
    </button>
  );
}
