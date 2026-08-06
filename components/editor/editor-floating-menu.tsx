"use client";

import type { ReactNode } from "react";
import type { EditorAnchorRect } from "./use-editor-anchor";

import { useEffect, useRef } from "react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/core/utils/cn";

import { useEditorAnchor } from "./use-editor-anchor";

type Props = {
  anchorRect: EditorAnchorRect | null;
  editorDom?: HTMLElement | null;
  children: ReactNode;
  className?: string;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  onClose: () => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onRestoreFocus?: () => void;
};

export function EditorFloatingMenu({
  anchorRect,
  editorDom,
  children,
  className,
  side = "top",
  align = "start",
  onClose,
  onEscapeKeyDown,
  onRestoreFocus,
}: Props) {
  const anchorRef = useEditorAnchor(anchorRect, editorDom);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    let frame = 0;

    function closeWhenDetached() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const reference = anchorRef.current?.getBoundingClientRect();
        let boundary = editorDom?.parentElement;

        while (boundary) {
          const style = getComputedStyle(boundary);
          if (/(auto|scroll)/.test(style.overflowY) && boundary.scrollHeight > boundary.clientHeight + 1) break;
          boundary = boundary.parentElement;
        }

        if (!reference || !boundary) return;

        const clip = boundary.getBoundingClientRect();
        if (
          reference.bottom <= clip.top ||
          reference.top >= clip.bottom ||
          reference.right <= clip.left ||
          reference.left >= clip.right
        ) {
          restoreFocusRef.current = true;
          onClose();
        }
      });
    }

    document.addEventListener("scroll", closeWhenDetached, true);
    window.addEventListener("resize", closeWhenDetached);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", closeWhenDetached, true);
      window.removeEventListener("resize", closeWhenDetached);
    };
  }, [anchorRef, editorDom, onClose]);

  return (
    <Popover
      open={Boolean(anchorRect)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <PopoverAnchor virtualRef={anchorRef} />

      <PopoverContent
        hideWhenDetached
        align={align}
        className={cn("w-auto p-1", className)}
        side={side}
        updatePositionStrategy="always"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!restoreFocusRef.current) return;

          restoreFocusRef.current = false;
          onRestoreFocus?.();
        }}
        onEscapeKeyDown={(event) => {
          onEscapeKeyDown?.(event);
          if (event.defaultPrevented) return;

          event.preventDefault();
          restoreFocusRef.current = true;
          onClose();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const content = event.currentTarget as HTMLElement | null;
          content?.querySelector<HTMLElement>('[data-slot="command-input"],input')?.focus();
        }}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
