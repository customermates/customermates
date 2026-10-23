"use client";

import type { ComponentProps, ReactNode } from "react";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StackDropdownItem } from "@/components/shared/stack-dropdown-item";
import { useNavigateToHref } from "@/components/shared/use-navigate-to-href";

import { cn } from "@/core/utils/cn";

import { AppChip } from "./app-chip";
import { visibleChipRows } from "./chip-stack-rows";

const moreWidthCache = new Map<string, number>();

function digitsNeeded(itemCount: number): number[] {
  const max = String(Math.max(1, itemCount)).length;

  return Array.from({ length: max }, (_, index) => index + 1);
}

function moreWidthKey(size: string | null | undefined, variant: string | null | undefined, digits: number): string {
  return `${size}|${variant}|${digits}`;
}

function itemsStamp<T extends ChipStackItem>(
  items: T[],
  size: string | null | undefined,
  variant: string | null | undefined,
): string {
  let stamp = `${size}|${variant}`;
  for (const item of items) stamp += `|${item.id}\u0000${item.label}`;

  return stamp;
}

type ChipStackItem = {
  id: string;
  label: string;
  startContent?: ReactNode;
  variant?: AppChipProps["variant"];
};

type AppChipProps = ComponentProps<typeof AppChip>;

type Props<T extends ChipStackItem> = {
  items: T[];
  onChipClick?: (item: T, trigger: HTMLElement | null) => void;
  chipHref?: (item: T) => string | undefined;
  chipLabel?: (item: T) => string;
  size?: AppChipProps["size"];
  variant?: AppChipProps["variant"];
  maxWidth?: number;
  extraCount?: number;
  overflowMenu?: boolean;
  fill?: boolean;
  onMoreClick?: (trigger: HTMLElement) => void;
  onMoreClickWhenLoaded?: boolean;
  maxRows?: number;
  renderChip?: (item: T, index: number) => ReactNode;
  moreLabel?: (count: number) => string;
  moreButtonProps?: Pick<
    ComponentProps<"button">,
    "id" | "aria-label" | "aria-controls" | "aria-expanded" | "aria-haspopup"
  >;
};

const defaultMoreLabel = (count: number) => `+${count}`;

export function AppChipStack<T extends ChipStackItem>({
  items,
  onChipClick,
  chipHref,
  chipLabel,
  size = "sm",
  variant = "secondary",
  maxWidth,
  extraCount = 0,
  overflowMenu = true,
  fill = false,
  onMoreClick,
  onMoreClickWhenLoaded = false,
  maxRows = 1,
  renderChip,
  moreLabel = defaultMoreLabel,
  moreButtonProps,
}: Props<T>) {
  const navigateToHref = useNavigateToHref();
  const GAP_PX = maxRows > 1 ? 4 : 8;
  const RESERVE_PX = 16;
  const MAX_WIDTH_THRESHOLD = 5;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null);
  const measurerRef = useRef<HTMLDivElement | null>(null);
  const moreMeasureRefs = useRef<Map<number, HTMLSpanElement>>(new Map());
  const chipMeasureRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [visibleCount, setVisibleCount] = useState<number>(items.length);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [singleVisibleMaxWidth, setSingleVisibleMaxWidth] = useState<number | null>(null);
  const singleVisibleMaxWidthRef = useRef<number | null>(null);
  const widthsRef = useRef<number[]>([]);
  const stampRef = useRef<string>("");
  const lastDimsRef = useRef<{ width: number; itemCount: number }>({
    width: 0,
    itemCount: 0,
  });
  const rafIdRef = useRef<number | null>(null);

  const needsOverflowHandling = items.length > 1 || extraCount > 0;
  const ensuredVisibleCount = Math.max(1, visibleCount);
  const ensuredHiddenItems = items.slice(ensuredVisibleCount);
  const hiddenCount = ensuredHiddenItems.length + extraCount;
  const handlesMoreClick = Boolean(onMoreClick && (extraCount > 0 || onMoreClickWhenLoaded));
  const isSingleVisibleWithOverflow = ensuredVisibleCount === 1 && hiddenCount > 0;

  const setChipMeasureRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (!el) chipMeasureRefs.current.delete(id);
      else chipMeasureRefs.current.set(id, el);
    },
    [],
  );

  const measureMoreChipWidth = useCallback(
    (hiddenCount: number): number => {
      const digits = Math.max(1, String(hiddenCount).length);

      return moreWidthCache.get(`${moreWidthKey(size, variant, digits)}|${moreLabel(Number("9".repeat(digits)))}`) ?? 0;
    },
    [size, variant, moreLabel],
  );

  const recalc = useCallback(() => {
    if (!containerRef.current) return;

    const containerWidth = Math.ceil(containerRef.current.clientWidth);
    if (widthsRef.current.length !== items.length || widthsRef.current.some((width) => !width))
      widthsRef.current = items.map((item) => Math.ceil(chipMeasureRefs.current.get(item.id)?.offsetWidth ?? 0));
    const widths = widthsRef.current;

    if (maxRows > 1) {
      const measuredWidths = items.map((item) => chipMeasureRefs.current.get(item.id)?.offsetWidth ?? 0);
      setVisibleCount(
        visibleChipRows(
          measuredWidths,
          containerWidth,
          maxRows,
          GAP_PX,
          (count) => measureMoreChipWidth(count) + RESERVE_PX,
          extraCount,
        ),
      );
      return;
    }

    let low = 0;
    let high = items.length;
    let best = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const hiddenCount = items.length - mid + extraCount;
      const moreWidth = hiddenCount > 0 ? measureMoreChipWidth(hiddenCount) : 0;

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

    const computedHiddenCount = items.length - best + extraCount;
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
  }, [items, extraCount, measureMoreChipWidth, visibleCount, maxRows, GAP_PX]);

  useLayoutEffect(() => {
    if (!needsOverflowHandling) return;

    for (const digits of digitsNeeded(items.length + extraCount)) {
      const key = `${moreWidthKey(size, variant, digits)}|${moreLabel(Number("9".repeat(digits)))}`;

      if (moreWidthCache.has(key)) continue;
      const el = moreMeasureRefs.current.get(digits);

      if (el) moreWidthCache.set(key, Math.ceil(el.offsetWidth));
    }

    const stamp = itemsStamp(items, size, variant);

    if (stampRef.current !== stamp || renderChip) {
      stampRef.current = stamp;
      widthsRef.current = items.map((it) => {
        const el = chipMeasureRefs.current.get(it.id);

        return el ? Math.ceil(el.offsetWidth) : 0;
      });
    }

    recalc();
  }, [items, extraCount, size, variant, recalc, needsOverflowHandling, renderChip, moreLabel]);

  useEffect(() => {
    if (!containerRef.current || !needsOverflowHandling) return;
    const ro = new ResizeObserver(() => {
      if (maxRows > 1) {
        recalc();
        return;
      }
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        const width = Math.ceil(containerRef.current?.clientWidth || 0);
        const itemCount = items.length;

        if (maxRows === 1 && width === lastDimsRef.current.width && itemCount === lastDimsRef.current.itemCount) return;
        lastDimsRef.current = { width, itemCount };
        recalc();
      });
    });

    ro.observe(containerRef.current);
    if (maxRows > 1 && measurerRef.current) ro.observe(measurerRef.current);

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      ro.disconnect();
    };
  }, [items.length, recalc, needsOverflowHandling, maxRows]);

  if (!items?.length && !(onMoreClickWhenLoaded && extraCount > 0)) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex min-w-0 overflow-hidden whitespace-nowrap",
        maxRows > 1 ? "flex-wrap" : "flex-nowrap",
        fill && "w-full",
      )}
      style={{ gap: GAP_PX, maxWidth }}
    >
      {needsOverflowHandling && (
        <div aria-hidden inert className="absolute left-0 top-0 -z-50 opacity-0 pointer-events-none">
          <div
            ref={measurerRef}
            className="flex flex-nowrap"
            style={{ gap: GAP_PX }}
            tabIndex={-1}
            onFocus={(e) => e.target.blur()}
          >
            {items.map((item, index) => (
              <div key={item.id} ref={setChipMeasureRef(item.id)} className="flex-none">
                {renderChip ? (
                  renderChip(item, index)
                ) : (
                  <AppChip
                    className="max-w-full cursor-pointer"
                    size={size}
                    startContent={item.startContent}
                    variant={item.variant ?? variant}
                  >
                    <span className="truncate whitespace-nowrap">{item.label}</span>
                  </AppChip>
                )}
              </div>
            ))}

            {digitsNeeded(items.length + extraCount).map((digits) => (
              <div key={digits} className="flex-none">
                <AppChip className="max-w-full" size={size} variant={variant}>
                  <span
                    ref={(el) => {
                      if (el) moreMeasureRefs.current.set(digits, el);
                      else moreMeasureRefs.current.delete(digits);
                    }}
                    className="truncate whitespace-nowrap"
                  >
                    {moreLabel(Number("9".repeat(digits)))}
                  </span>
                </AppChip>
              </div>
            ))}
          </div>
        </div>
      )}

      {items.slice(0, ensuredVisibleCount).map((item, index) => {
        if (renderChip) {
          return (
            <span key={item.id} className="inline-flex max-w-full min-w-0 shrink-0" data-chip-id={item.id}>
              {renderChip(item, index)}
            </span>
          );
        }
        const style: React.CSSProperties =
          isSingleVisibleWithOverflow && singleVisibleMaxWidth != null
            ? { maxWidth: `${singleVisibleMaxWidth}px` }
            : {};
        const href = chipHref?.(item);
        const actionable = Boolean(onChipClick || href);
        const chip = (
          <AppChip
            className={cn("max-w-full min-w-0 shrink", actionable && "cursor-pointer")}
            interactive={actionable}
            size={size}
            startContent={item.startContent}
            style={style}
            variant={item.variant ?? variant}
          >
            <span className="truncate whitespace-nowrap">{item.label}</span>
          </AppChip>
        );

        return (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              {href ? (
                <a
                  aria-label={chipLabel?.(item)}
                  className="relative inline-flex min-w-0 shrink"
                  data-chip-id={item.id}
                  href={href}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                    e.preventDefault();
                    if (onChipClick) onChipClick(item, e.currentTarget);
                    else navigateToHref(href);
                  }}
                >
                  {chip}
                </a>
              ) : !actionable ? (
                <span className="relative inline-flex min-w-0 shrink" data-chip-id={item.id}>
                  {chip}
                </span>
              ) : (
                <button
                  aria-label={chipLabel?.(item)}
                  className="relative inline-flex min-w-0 shrink"
                  data-chip-id={item.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChipClick?.(item, e.currentTarget);
                  }}
                >
                  {chip}
                </button>
              )}
            </TooltipTrigger>

            <TooltipContent>{item.label}</TooltipContent>
          </Tooltip>
        );
      })}

      {hiddenCount > 0 && handlesMoreClick && (
        <button
          {...moreButtonProps}
          className="relative inline-flex flex-none"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onMoreClick?.(event.currentTarget);
          }}
        >
          <AppChip interactive className="max-w-full cursor-pointer" size={size} variant={variant}>
            {moreLabel(hiddenCount)}
          </AppChip>
        </button>
      )}

      {hiddenCount > 0 && !handlesMoreClick && (!overflowMenu || ensuredHiddenItems.length === 0) && (
        <AppChip
          className="max-w-full flex-none"
          size={size}
          tooltip={ensuredHiddenItems.length ? ensuredHiddenItems.map((item) => item.label).join(", ") : undefined}
          variant={variant}
        >
          {moreLabel(hiddenCount)}
        </AppChip>
      )}

      {hiddenCount > 0 && !handlesMoreClick && overflowMenu && ensuredHiddenItems.length > 0 && (
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <button ref={moreTriggerRef} className="flex-none inline-flex" type="button">
              <AppChip interactive className="max-w-full cursor-pointer" size={size} variant={variant}>
                <span className="truncate whitespace-nowrap">{moreLabel(hiddenCount)}</span>
              </AppChip>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
            {ensuredHiddenItems.map((item) => {
              const href = chipHref?.(item);
              return (
                <StackDropdownItem
                  key={item.id}
                  close={() => setDropdownOpen(false)}
                  href={href}
                  onActivate={() => {
                    if (onChipClick) onChipClick(item, moreTriggerRef.current);
                    else if (href) navigateToHref(href);
                  }}
                >
                  {item.variant ? (
                    <AppChip variant={item.variant}>{item.label}</AppChip>
                  ) : (
                    <>
                      {item.startContent}

                      {item.label}
                    </>
                  )}
                </StackDropdownItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
