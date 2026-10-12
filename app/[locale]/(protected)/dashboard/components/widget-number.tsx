"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  value: string;
  exact: string;
  context: string;
};

export function WidgetNumber({ value, exact, context }: Props) {
  const compacted = value !== exact;
  const headline = compacted ? (
    <button
      aria-label={exact}
      className="max-w-full cursor-pointer truncate rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      data-slot="widget-number-value"
      type="button"
    >
      {value}
    </button>
  ) : (
    <span data-slot="widget-number-value">{value}</span>
  );
  return (
    <div className="@container flex min-h-0 min-w-0 flex-col gap-1" data-slot="widget-number">
      <p
        className="min-h-[1em] max-w-full truncate font-medium leading-tight tracking-tight tabular-nums"
        style={{ fontSize: `min(2rem, ${(150 / Math.max(value.length, 1)).toFixed(2)}cqw)` }}
      >
        {compacted ? (
          <Tooltip>
            <TooltipTrigger asChild>{headline}</TooltipTrigger>

            <TooltipContent className="tabular-nums" side="bottom">
              {exact}
            </TooltipContent>
          </Tooltip>
        ) : (
          headline
        )}
      </p>

      <p className="truncate text-xs text-muted-foreground tabular-nums" data-slot="widget-number-context">
        {context}
      </p>
    </div>
  );
}
