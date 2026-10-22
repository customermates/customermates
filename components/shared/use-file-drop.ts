"use client";

import type { DragEvent } from "react";

import { useState } from "react";

export function useFileDrop(enabled: boolean, onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const takes = (event: DragEvent<HTMLElement>) => enabled && event.dataTransfer.types.includes("Files");
  return {
    dragging: enabled && dragging,
    handlers: {
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!takes(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDragging(true);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        setDragging(false);
        if (!takes(event)) return;
        event.preventDefault();
        onFiles(Array.from(event.dataTransfer.files));
      },
    },
  };
}
