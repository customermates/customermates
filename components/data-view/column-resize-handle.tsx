"use client";

import type { KeyboardEvent, PointerEvent } from "react";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isResizeDoubleTap } from "@/components/shared/resize-interaction";
import { cn } from "@/core/utils/cn";

import {
  beginColumnResize,
  keyboardColumnWidth,
  shouldCommitColumnResize,
  updateColumnResize,
  type ColumnResizeSession,
  type ColumnWidthBounds,
} from "./data-table-resize";

type Props = {
  columnId: string;
  label: string;
  measure: (handle: HTMLButtonElement) => number | undefined;
  bounds?: ColumnWidthBounds;
  resizing: boolean;
  className?: string;
  onLiveWidth: (session: ColumnResizeSession | undefined) => void;
  onCommit: (width: number) => void;
  onReset: () => void;
};

export function ColumnResizeHandle({
  columnId,
  label,
  measure,
  bounds,
  resizing,
  className,
  onLiveWidth,
  onCommit,
  onReset,
}: Props) {
  const t = useTranslations();
  const activeRef = useRef<{ handle: HTMLButtonElement; session: ColumnResizeSession }>();
  const lastTouchTapRef = useRef<number>();
  const detachRef = useRef<() => void>();

  const cancel = useCallback(() => {
    const active = activeRef.current;
    detachRef.current?.();
    detachRef.current = undefined;
    if (!active) return;
    activeRef.current = undefined;
    onLiveWidth(undefined);
    if (active.handle.hasPointerCapture(active.session.pointerId))
      active.handle.releasePointerCapture(active.session.pointerId);
  }, [onLiveWidth]);

  useEffect(() => () => detachRef.current?.(), []);

  function attachCancelListeners() {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") cancel();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibilityChange);
    detachRef.current = () => {
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    const renderedWidth = measure(event.currentTarget);
    if (renderedWidth === undefined) return;

    event.stopPropagation();
    const session = beginColumnResize({
      columnId,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      clientX: event.clientX,
      renderedWidth,
      bounds,
    });
    activeRef.current = { handle: event.currentTarget, session };
    attachCancelListeners();
    onLiveWidth(session);
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const active = activeRef.current;
    if (!active || active.session.pointerId !== event.pointerId) return;

    event.preventDefault();
    active.session = updateColumnResize(active.session, event.clientX);
    onLiveWidth(active.session);
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const active = activeRef.current;
    if (!active || active.session.pointerId !== event.pointerId) return;

    event.stopPropagation();
    const session = updateColumnResize(active.session, event.clientX);
    cancel();

    if (shouldCommitColumnResize(session)) {
      lastTouchTapRef.current = undefined;
      onCommit(session.currentWidth);
      return;
    }

    if (session.pointerType !== "touch" || session.hasMoved) return;
    if (isResizeDoubleTap(lastTouchTapRef.current, event.timeStamp)) {
      lastTouchTapRef.current = undefined;
      onReset();
      return;
    }
    lastTouchTapRef.current = event.timeStamp;
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onReset();
      return;
    }

    const renderedWidth = measure(event.currentTarget);
    if (renderedWidth === undefined) return;
    const width = keyboardColumnWidth(renderedWidth, event.key, event.shiftKey, bounds);
    if (width === undefined) return;

    event.preventDefault();
    event.stopPropagation();
    onCommit(width);
  }

  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <button
          aria-keyshortcuts="ArrowLeft ArrowRight Home Enter Space"
          aria-label={label}
          className={cn(
            "group/resize-handle absolute inset-y-0 right-0 z-10 flex w-3 translate-x-1/2 cursor-col-resize touch-none select-none justify-center border-0 bg-transparent p-0 opacity-0 outline-none group-hover/resize-header:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-foreground/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background data-[state=resizing]:opacity-100 any-pointer-coarse:w-6 any-pointer-coarse:opacity-100",
            className,
          )}
          data-slot="column-resize-handle"
          data-state={resizing ? "resizing" : undefined}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (event.detail === 0) onReset();
          }}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onReset();
          }}
          onKeyDown={onKeyDown}
          onLostPointerCapture={cancel}
          onPointerCancel={cancel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <span
            aria-hidden="true"
            className="w-0.5 rounded-full bg-foreground/45 transition-colors group-hover/resize-handle:bg-foreground/70 group-focus-visible/resize-handle:bg-foreground/70 group-data-[state=resizing]/resize-handle:bg-foreground/70"
            data-slot="column-resize-indicator"
          />
        </button>
      </TooltipTrigger>

      <TooltipContent>{t("DataView.resizeHint")}</TooltipContent>
    </Tooltip>
  );
}
