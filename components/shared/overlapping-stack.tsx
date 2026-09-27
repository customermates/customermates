"use client";

import type { ReactNode } from "react";

import { Fragment, useState } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/core/utils/cn";

const STACK_CLASSES = {
  default:
    "-space-x-2 [&>*:not(:last-child)]:mask-[radial-gradient(circle_16px_at_calc(100%+6px)_50%,transparent_99%,black_100%)]",
  sm: "-space-x-1.5 [&>*:not(:last-child)]:mask-[radial-gradient(circle_11px_at_calc(100%+4px)_50%,transparent_99%,black_100%)]",
};

type Props<TBadge, TRow> = {
  badges: TBadge[];
  maxVisible?: number;
  size?: keyof typeof STACK_CLASSES;
  className?: string;
  contentAlign?: "start" | "center" | "end";
  badgeKey: (badge: TBadge) => string;
  renderBadge: (badge: TBadge) => ReactNode;
  renderOverflow: (count: number) => ReactNode;
  rows?: TRow[];
  rowKey?: (row: TRow) => string;
  renderRow?: (row: TRow, close: () => void) => ReactNode;
  triggerLabel?: string;
};

export function OverlappingStack<TBadge, TRow = never>({
  badges,
  rows,
  maxVisible = 3,
  size = "default",
  className,
  contentAlign,
  badgeKey,
  renderBadge,
  renderOverflow,
  rowKey,
  renderRow,
  triggerLabel,
}: Props<TBadge, TRow>) {
  const [isOpen, setIsOpen] = useState(false);

  if (!badges.length) return null;

  const visible = badges.slice(0, maxVisible);
  const remaining = badges.length - visible.length;

  const stackClassName = cn("flex **:data-[slot=avatar]:rounded-full!", STACK_CLASSES[size]);
  const stackBadges = (
    <>
      {visible.map((badge) => (
        <Fragment key={badgeKey(badge)}>{renderBadge(badge)}</Fragment>
      ))}

      {remaining > 0 && renderOverflow(remaining)}
    </>
  );

  if (!rows || !rowKey || !renderRow) {
    return (
      <div className={cn("flex items-center", className)}>
        <div className={stackClassName}>{stackBadges}</div>
      </div>
    );
  }

  return (
    <div className={cn("flex cursor-pointer items-center select-none", className)}>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={triggerLabel}
            className={cn(
              stackClassName,
              "cursor-pointer rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            )}
            type="button"
          >
            {stackBadges}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align={contentAlign} className="max-h-60 overflow-y-auto">
          {rows.map((row) => (
            <Fragment key={rowKey(row)}>{renderRow(row, () => setIsOpen(false))}</Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
