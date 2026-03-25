"use client";

import type { ChipProps } from "@heroui/chip";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dropdown, DropdownMenu, DropdownTrigger } from "@heroui/dropdown";

import { XDropdownItem } from "../x-inputs/x-dropdown-item";
import { XTooltip } from "../x-tooltip";

import { XClickableChip } from "./x-clickable-chip";

type ChipStackItem = {
  id: string;
  label: string;
  startContent?: React.ReactNode;
  template?: { key: string; presets: Record<string, unknown> } | undefined;
};

type Props<T extends ChipStackItem> = {
  items: T[];
  onChipClick?: (item: T) => void;
} & Pick<ChipProps, "size" | "variant" | "color">;

export function XChipStack<T extends ChipStackItem>({
  items,
  onChipClick,
  size = "sm",
  variant = "flat",
  color,
}: Props<T>) {
  const GAP_PX = 8;
  const RESERVE_PX = 16;
  const MAX_WIDTH_THRESHOLD = 5;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const measurerRef = useRef<HTMLDivElement | null>(null);
  const moreMeasurerRef = useRef<HTMLDivElement | null>(null);
  const chipMeasureRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [visibleCount, setVisibleCount] = useState<number>(items.length);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [singleVisibleMaxWidth, setSingleVisibleMaxWidth] = useState<number | null>(null);
  const singleVisibleMaxWidthRef = useRef<number | null>(null);
  const widthsRef = useRef<number[]>([]);
  const stampRef = useRef<string>("");
  const moreWidthByDigitsRef = useRef<Record<number, number>>({});
  const lastDimsRef = useRef<{ width: number; itemCount: number }>({ width: 0, itemCount: 0 });
  const rafIdRef = useRef<number | null>(null);

  const ensuredVisibleCount = Math.max(1, visibleCount);
  const ensuredHiddenItems = items.slice(ensuredVisibleCount);
  const isSingleVisibleWithOverflow = ensuredVisibleCount === 1 && ensuredHiddenItems.length > 0;

  const moreLabel = useCallback((n: number) => `+${n}`, []);

  const setChipMeasureRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (!el) chipMeasureRefs.current.delete(id);
      else chipMeasureRefs.current.set(id, el);
    },
    [],
  );

  const measureMoreChipWidth = useCallback(
    (hiddenCount: number): number => {
      const el = moreMeasurerRef.current;

      if (!el) return 0;
      el.textContent = moreLabel(hiddenCount);
      const rect = el.getBoundingClientRect();

      return Math.ceil(rect.width);
    },
    [moreLabel],
  );

  const recalc = useCallback(() => {
    if (!containerRef.current) return;

    const containerWidth = Math.ceil(containerRef.current.clientWidth);
    const widths = widthsRef.current;

    let low = 0;
    let high = items.length;
    let best = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const hiddenCount = items.length - mid;
      const digits = hiddenCount > 0 ? String(hiddenCount).length : 0;
      let moreWidth = 0;

      if (hiddenCount > 0) {
        if (moreWidthByDigitsRef.current[digits] == null) {
          const widestLabel = moreLabel(Number("9".repeat(digits)) || 0);

          if (moreMeasurerRef.current) {
            moreMeasurerRef.current.textContent = widestLabel;
            moreWidthByDigitsRef.current[digits] = Math.ceil(moreMeasurerRef.current.getBoundingClientRect().width);
          } else moreWidthByDigitsRef.current[digits] = measureMoreChipWidth(hiddenCount);
        }
        moreWidth = moreWidthByDigitsRef.current[digits] || 0;
      }

      let chipsWidth = 0;

      for (let i = 0; i < mid; i++) chipsWidth += widths[i] || 0;
      const gaps = Math.max(0, mid - 1) * GAP_PX + (hiddenCount > 0 ? GAP_PX : 0);
      const reserve = hiddenCount > 0 ? RESERVE_PX : 0;
      const total = chipsWidth + gaps + moreWidth + reserve;

      if (total <= containerWidth) {
        best = mid;
        low = mid + 1;
      } else high = mid - 1;
    }

    if (best !== visibleCount) setVisibleCount(best);

    const computedHiddenCount = items.length - best;
    const shouldHaveMaxWidth = computedHiddenCount > 0 && best <= 1;

    if (shouldHaveMaxWidth) {
      const moreWidth = measureMoreChipWidth(computedHiddenCount);
      const nextMax = Math.round(Math.max(0, containerWidth - moreWidth - GAP_PX - RESERVE_PX));
      const currentMax = singleVisibleMaxWidthRef.current;
      const shouldUpdate = currentMax == null || Math.abs(nextMax - currentMax) > MAX_WIDTH_THRESHOLD;

      if (shouldUpdate) {
        singleVisibleMaxWidthRef.current = nextMax;
        setSingleVisibleMaxWidth(nextMax);
      }
    } else if (singleVisibleMaxWidthRef.current !== null) {
      singleVisibleMaxWidthRef.current = null;
      setSingleVisibleMaxWidth(null);
    }
  }, [items, measureMoreChipWidth, moreLabel, visibleCount]);

  useLayoutEffect(() => {
    const stamp = JSON.stringify(items.map((i) => [i.id, i.label])) + `|${size}|${variant}|${color}`;

    if (stampRef.current !== stamp) {
      stampRef.current = stamp;
      widthsRef.current = items.map((it) => {
        const el = chipMeasureRefs.current.get(it.id);

        if (!el) return 0;
        const ow = (el as HTMLElement).offsetWidth;

        return Math.ceil(ow || el.getBoundingClientRect().width) || 0;
      });
      moreWidthByDigitsRef.current = {};
    }

    recalc();
  }, [items, size, variant, color, recalc]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        const width = Math.ceil(containerRef.current?.clientWidth || 0);
        const itemCount = items.length;

        if (width === lastDimsRef.current.width && itemCount === lastDimsRef.current.itemCount) return;
        lastDimsRef.current = { width, itemCount };
        recalc();
      });
    });

    ro.observe(containerRef.current);

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      ro.disconnect();
    };
  }, [items.length, recalc]);

  if (!items?.length) return null;

  return (
    <div
      ref={containerRef}
      className={"flex min-w-0 overflow-hidden flex-nowrap whitespace-nowrap"}
      style={{ gap: GAP_PX }}
    >
      <div aria-hidden className="absolute -z-50 opacity-0 pointer-events-none">
        <div
          ref={measurerRef}
          className="flex flex-nowrap"
          style={{ gap: GAP_PX }}
          tabIndex={-1}
          onFocus={(e) => e.target.blur()}
        >
          {items.map((item) => (
            <div key={item.id} ref={setChipMeasureRef(item.id)} className="flex-none">
              <XClickableChip
                className="max-w-full"
                color={color}
                size={size}
                startContent={item.startContent}
                variant={variant}
              >
                <span className="truncate whitespace-nowrap">{item.label}</span>
              </XClickableChip>
            </div>
          ))}

          <div className="flex-none">
            <XClickableChip className="max-w-full" color={color} size={size} variant={variant}>
              <span ref={moreMeasurerRef} className="truncate whitespace-nowrap">
                +0
              </span>
            </XClickableChip>
          </div>
        </div>
      </div>

      {items.slice(0, ensuredVisibleCount).map((item) => {
        const className = isSingleVisibleWithOverflow ? "max-w-full min-w-0 shrink" : "max-w-full flex-none";
        const style: React.CSSProperties =
          isSingleVisibleWithOverflow && singleVisibleMaxWidth != null
            ? { maxWidth: `${singleVisibleMaxWidth}px` }
            : {};

        return (
          <XTooltip key={item.id} content={item.label}>
            <XClickableChip
              className={className}
              color={color}
              size={size}
              startContent={item.startContent}
              style={style}
              variant={variant}
              onClick={(e) => {
                onChipClick?.(item);
                e.stopPropagation();
              }}
            >
              <span className="truncate whitespace-nowrap">{item.label}</span>
            </XClickableChip>
          </XTooltip>
        );
      })}

      {ensuredHiddenItems.length > 0 && (
        <Dropdown isOpen={dropdownOpen} placement="bottom-start" onOpenChange={setDropdownOpen}>
          <DropdownTrigger>
            <div className="flex-none">
              <XClickableChip className="max-w-full" color={color} size={size} variant={variant}>
                <span className="truncate whitespace-nowrap">{moreLabel(ensuredHiddenItems.length)}</span>
              </XClickableChip>
            </div>
          </DropdownTrigger>

          <DropdownMenu
            className="max-h-60 overflow-y-auto"
            onAction={(key) => {
              const target = ensuredHiddenItems.find((it) => it.id === key);

              if (target) onChipClick?.(target);
              setDropdownOpen(false);
            }}
          >
            {ensuredHiddenItems.map((item) =>
              XDropdownItem({
                key: item.id,
                startContent: item.startContent,
                children: item.label,
              }),
            )}
          </DropdownMenu>
        </Dropdown>
      )}
    </div>
  );
}
