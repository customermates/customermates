"use client";

import type { ReactNode } from "react";

import { useRef } from "react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useOverlayFocusReturn } from "@/components/ui/use-overlay-focus-return";

type Props = {
  open: boolean;
  label: string;
  anchorRect: () => DOMRect;
  boundary: HTMLElement | null;
  opener: HTMLElement | null;
  fallback: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
};

export function MapPinPopover({ open, label, anchorRect, boundary, opener, fallback, onClose, children }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef({ getBoundingClientRect: anchorRect });
  anchorRef.current.getBoundingClientRect = anchorRect;
  const focusReturn = useOverlayFocusReturn(open, opener, fallback);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <PopoverAnchor virtualRef={anchorRef} />

      <PopoverContent
        ref={contentRef}
        data-map-popover
        hideWhenDetached
        aria-label={label}
        className="w-64 p-3 text-sm"
        collisionBoundary={boundary}
        side="right"
        sideOffset={10}
        updatePositionStrategy="always"
        onCloseAutoFocus={focusReturn.onCloseAutoFocus}
        onInteractOutside={(event) => {
          if (event.target instanceof Node && boundary?.contains(event.target)) event.preventDefault();
        }}
        onOpenAutoFocus={() => {
          focusReturn.onOpenAutoFocus();
          contentRef.current?.focus({ preventScroll: true });
        }}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
