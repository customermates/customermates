"use client";

/* eslint-disable jsx-a11y/no-noninteractive-element-interactions -- an adjustable WAI-ARIA separator handles pointer and keyboard input */

import type { CSSProperties, HTMLAttributes, KeyboardEvent, PointerEvent, ReactElement } from "react";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/core/utils/cn";
import {
  fixedFirstPanelTemplate,
  isPanelTouchReset,
  keyboardPanelDelta,
  normalizePanelSizes,
  proportionalPanelTemplate,
  resizeAdjacentPanels,
} from "./resizable-panels.utils";

export type ResizablePanelDefinition = {
  id: string;
  label: string;
  controlId: string;
  minimumSize: number;
  maximumSize?: number;
  defaultSize: number;
  element: ReactElement;
};

type Props = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  className?: string;
  defaultTemplate: string;
  handleClassName?: string;
  initialSizes?: readonly number[] | null;
  layoutMode?: "fixed-first" | "proportional";
  panels: readonly ResizablePanelDefinition[];
  onSizesCommit?: (sizes: readonly number[] | null) => void;
};

type ActiveResize = {
  dividerIndex: number;
  handle: HTMLDivElement;
  hasMoved: boolean;
  pointerId: number;
  pointerType: string;
  previousSizes: number[] | null;
  startClientX: number;
  startSizes: number[];
};

type PanelGridStyle = CSSProperties & { "--panel-grid-template": string };

function equalSizes(left: readonly number[] | null, right: readonly number[] | null): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((size, index) => size === right[index]);
}

function resolveInitialSizes(
  initialSizes: readonly number[] | null | undefined,
  panelCount: number,
  layoutMode: "fixed-first" | "proportional",
): number[] | null {
  if (
    !initialSizes ||
    initialSizes.length !== panelCount ||
    initialSizes.some((size) => !Number.isFinite(size) || size <= 0)
  )
    return null;

  return layoutMode === "fixed-first" ? [...initialSizes] : normalizePanelSizes(initialSizes);
}

function measuredPanelSizes(group: HTMLDivElement | null): number[] | null {
  if (!group) return null;
  const panels = Array.from(group.children).filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement && !element.hasAttribute("data-panel-resize-divider"),
  );
  const sizes = panels.map((panel) => panel.getBoundingClientRect().width);
  return sizes.length >= 2 && sizes.every((size) => Number.isFinite(size) && size > 0) ? sizes : null;
}

export function ResizablePanelGroup({
  className,
  defaultTemplate,
  handleClassName,
  initialSizes,
  layoutMode = "proportional",
  panels,
  onSizesCommit,
  ...groupProps
}: Props) {
  const t = useTranslations();
  const groupRef = useRef<HTMLDivElement>(null);
  const activeResizeRef = useRef<ActiveResize>();
  const lastTouchTapRef = useRef<{ dividerIndex: number; at: number }>();
  const minimums = useMemo(() => panels.map((panel) => panel.minimumSize), [panels]);
  const maximums = useMemo(() => panels.map((panel) => panel.maximumSize), [panels]);
  const defaults = useMemo(() => panels.map((panel) => panel.defaultSize), [panels]);
  const panelConfigurationKey = panels.map(({ id }) => id).join("\u0000");
  const latestConfigurationRef = useRef({
    defaults,
    initialSizes,
    layoutMode,
    panelCount: panels.length,
  });
  latestConfigurationRef.current = {
    defaults,
    initialSizes,
    layoutMode,
    panelCount: panels.length,
  };
  const configurationKeyRef = useRef(panelConfigurationKey);
  const [sizes, setSizes] = useState<number[] | null>(() =>
    resolveInitialSizes(initialSizes, panels.length, layoutMode),
  );
  const [renderedSizes, setRenderedSizes] = useState<number[]>(() => [...defaults]);
  const [activeDivider, setActiveDivider] = useState<number>();

  const template =
    layoutMode === "fixed-first"
      ? fixedFirstPanelTemplate(sizes, minimums, maximums, defaultTemplate)
      : proportionalPanelTemplate(sizes, minimums, defaultTemplate);

  const releasePointer = (active: ActiveResize) => {
    if (
      typeof active.handle.hasPointerCapture === "function" &&
      active.handle.hasPointerCapture(active.pointerId) &&
      typeof active.handle.releasePointerCapture === "function"
    )
      active.handle.releasePointerCapture(active.pointerId);
  };

  const cancelActiveResize = useCallback(() => {
    const active = activeResizeRef.current;
    if (!active) return;

    activeResizeRef.current = undefined;
    releasePointer(active);
    setSizes(active.previousSizes);
    setRenderedSizes(active.startSizes);
    setActiveDivider(undefined);
  }, []);

  const syncMeasurements = useCallback(() => {
    if (activeResizeRef.current) return;
    const measured = measuredPanelSizes(groupRef.current);
    if (measured) setRenderedSizes((current) => (equalSizes(current, measured) ? current : measured));
  }, []);

  const resetSizes = useCallback(() => {
    const active = activeResizeRef.current;
    if (active) {
      activeResizeRef.current = undefined;
      releasePointer(active);
    }
    lastTouchTapRef.current = undefined;
    setSizes(null);
    setRenderedSizes(defaults);
    setActiveDivider(undefined);
    onSizesCommit?.(null);
  }, [defaults, onSizesCommit]);

  useLayoutEffect(() => {
    if (configurationKeyRef.current === panelConfigurationKey) return;
    configurationKeyRef.current = panelConfigurationKey;
    cancelActiveResize();
    lastTouchTapRef.current = undefined;
    const configuration = latestConfigurationRef.current;
    setSizes(resolveInitialSizes(configuration.initialSizes, configuration.panelCount, configuration.layoutMode));
    setRenderedSizes([...configuration.defaults]);
    setActiveDivider(undefined);
  }, [cancelActiveResize, panelConfigurationKey]);

  useLayoutEffect(syncMeasurements, [syncMeasurements, template]);

  useEffect(() => {
    syncMeasurements();
    const group = groupRef.current;
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(syncMeasurements);
    if (group) observer?.observe(group);
    window.addEventListener("resize", syncMeasurements);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncMeasurements);
    };
  }, [panels.length, syncMeasurements]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") cancelActiveResize();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") cancelActiveResize();
    };

    window.addEventListener("blur", cancelActiveResize);
    window.addEventListener("resize", cancelActiveResize);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", cancelActiveResize);
      window.removeEventListener("resize", cancelActiveResize);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      const active = activeResizeRef.current;
      if (active) releasePointer(active);
      activeResizeRef.current = undefined;
    };
  }, [cancelActiveResize]);

  function beginResize(event: PointerEvent<HTMLDivElement>, dividerIndex: number) {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    const measured = measuredPanelSizes(groupRef.current);
    if (!measured || measured.length !== panels.length) return;

    const active: ActiveResize = {
      dividerIndex,
      handle: event.currentTarget,
      hasMoved: false,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      previousSizes: sizes,
      startClientX: event.clientX,
      startSizes: measured,
    };
    activeResizeRef.current = active;
    setSizes(measured);
    setRenderedSizes(measured);
    setActiveDivider(dividerIndex);
    event.currentTarget.focus({ preventScroll: true });
    if (typeof event.currentTarget.setPointerCapture === "function")
      event.currentTarget.setPointerCapture(event.pointerId);
  }

  function nextPointerSizes(active: ActiveResize, clientX: number): number[] {
    return resizeAdjacentPanels({
      sizes: active.startSizes,
      minimums,
      maximums,
      dividerIndex: active.dividerIndex,
      delta: clientX - active.startClientX,
    });
  }

  function moveResize(event: PointerEvent<HTMLDivElement>) {
    const active = activeResizeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;

    event.preventDefault();
    const next = nextPointerSizes(active, event.clientX);
    active.hasMoved = active.hasMoved || !equalSizes(next, active.startSizes);
    setSizes(next);
    setRenderedSizes(next);
  }

  function finishResize(event: PointerEvent<HTMLDivElement>) {
    const active = activeResizeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;

    event.stopPropagation();
    const next = nextPointerSizes(active, event.clientX);
    const changed = active.hasMoved || !equalSizes(next, active.startSizes);
    activeResizeRef.current = undefined;
    releasePointer(active);
    setActiveDivider(undefined);

    if (changed) {
      lastTouchTapRef.current = undefined;
      const committed = layoutMode === "fixed-first" ? next : (normalizePanelSizes(next) ?? next);
      setSizes(committed);
      setRenderedSizes(next);
      onSizesCommit?.(committed);
      return;
    }

    setSizes(active.previousSizes);
    setRenderedSizes(active.startSizes);
    if (active.pointerType !== "touch") return;
    const previousTap = lastTouchTapRef.current;
    if (previousTap?.dividerIndex === active.dividerIndex && isPanelTouchReset(previousTap.at, event.timeStamp)) {
      resetSizes();
      return;
    }
    lastTouchTapRef.current = {
      dividerIndex: active.dividerIndex,
      at: event.timeStamp,
    };
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>, dividerIndex: number) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      resetSizes();
      return;
    }

    const measured = measuredPanelSizes(groupRef.current) ?? renderedSizes;
    const leftSize = measured[dividerIndex];
    const rightSize = measured[dividerIndex + 1];
    if (leftSize === undefined || rightSize === undefined) return;
    const delta = keyboardPanelDelta({
      key: event.key,
      shiftKey: event.shiftKey,
      leftSize,
      rightSize,
      leftMinimum: minimums[dividerIndex] ?? 0,
      rightMinimum: minimums[dividerIndex + 1] ?? 0,
      leftMaximum: maximums[dividerIndex],
      rightMaximum: maximums[dividerIndex + 1],
    });
    if (delta === undefined) return;

    event.preventDefault();
    const next = resizeAdjacentPanels({
      sizes: measured,
      minimums,
      maximums,
      dividerIndex,
      delta,
    });
    if (equalSizes(next, measured)) return;
    const committed = layoutMode === "fixed-first" ? next : (normalizePanelSizes(next) ?? next);
    setSizes(committed);
    setRenderedSizes(next);
    onSizesCommit?.(committed);
  }

  const children = panels.flatMap((panel, index) => {
    const panelElement = <Fragment key={panel.id}>{panel.element}</Fragment>;
    const nextPanel = panels[index + 1];
    if (!nextPanel) return [panelElement];

    const leftSize = renderedSizes[index] ?? panel.defaultSize;
    const rightSize = renderedSizes[index + 1] ?? nextPanel.defaultSize;
    const valueMinimum = panel.minimumSize;
    const valueMaximum = Math.max(
      valueMinimum,
      Math.min(panel.maximumSize ?? Number.POSITIVE_INFINITY, leftSize + rightSize - nextPanel.minimumSize),
    );

    return [
      panelElement,
      <div
        key={`${panel.id}-${nextPanel.id}`}
        className={cn("relative z-20 w-px bg-border", handleClassName)}
        data-panel-resize-divider=""
      >
        <div
          aria-controls={`${panel.controlId} ${nextPanel.controlId}`}
          aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight Home End Enter Space"
          aria-label={t("ResizablePanels.resize", {
            before: panel.label,
            after: nextPanel.label,
          })}
          aria-orientation="vertical"
          aria-valuemax={Math.round(valueMaximum)}
          aria-valuemin={Math.round(valueMinimum)}
          aria-valuenow={Math.round(Math.min(valueMaximum, Math.max(valueMinimum, leftSize)))}
          className="group/resize-handle absolute inset-y-0 left-1/2 flex w-3 -translate-x-1/2 cursor-col-resize touch-none select-none justify-center border-0 bg-transparent p-0 outline-none any-pointer-coarse:w-6"
          data-panel-resize-handle={`${panel.id}-${nextPanel.id}`}
          data-state={activeDivider === index ? "resizing" : undefined}
          role="separator"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- an adjustable WAI-ARIA separator is keyboard focusable
          tabIndex={0}
          title={t("ResizablePanels.hint")}
          onDoubleClick={(event) => {
            event.preventDefault();
            resetSizes();
          }}
          onKeyDown={(event) => resizeWithKeyboard(event, index)}
          onLostPointerCapture={cancelActiveResize}
          onPointerCancel={cancelActiveResize}
          onPointerDown={(event) => beginResize(event, index)}
          onPointerMove={moveResize}
          onPointerUp={finishResize}
        >
          <span
            aria-hidden="true"
            className="h-full w-0.5 rounded-full bg-foreground/45 opacity-0 transition-[opacity,background-color] group-hover/resize-handle:bg-foreground/70 group-hover/resize-handle:opacity-100 group-focus-visible/resize-handle:bg-foreground/70 group-focus-visible/resize-handle:opacity-100 group-data-[state=resizing]/resize-handle:bg-foreground/70 group-data-[state=resizing]/resize-handle:opacity-100 any-pointer-coarse:opacity-100"
          />
        </div>
      </div>,
    ];
  });

  return (
    <div
      ref={groupRef}
      {...groupProps}
      className={className}
      data-resizable-panel-group=""
      style={{ "--panel-grid-template": template } as PanelGridStyle}
    >
      {children}
    </div>
  );
}
