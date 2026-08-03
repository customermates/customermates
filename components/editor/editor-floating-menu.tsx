"use client";

import type { ReactNode } from "react";
import type { EditorAnchorRect } from "./use-editor-anchor";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/core/utils/cn";

import { useEditorAnchor } from "./use-editor-anchor";

type Props = {
  open: boolean;
  anchorRect: EditorAnchorRect | null;
  editorDom?: HTMLElement | null;
  children: ReactNode;
  className?: string;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  onClose: () => void;
};

export function EditorFloatingMenu({
  open,
  anchorRect,
  editorDom,
  children,
  className,
  side = "top",
  align = "start",
  onClose,
}: Props) {
  const anchorRef = useEditorAnchor(anchorRect, editorDom);

  return (
    <Popover
      open={open && Boolean(anchorRect)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <PopoverAnchor virtualRef={anchorRef} />

      <PopoverContent hideWhenDetached align={align} className={cn("w-auto p-1", className)} side={side}>
        {children}
      </PopoverContent>
    </Popover>
  );
}
