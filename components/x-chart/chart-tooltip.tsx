"use client";

import type { TooltipProps } from "recharts";

import { Tooltip } from "recharts";
import { observer } from "mobx-react-lite";
import { cn } from "@heroui/theme";

import { AggregationType } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";

type TooltipContentProps = {
  active?: boolean;
  aggregationType?: AggregationType;
  label?: string | number;
  payload?: ReadonlyArray<{
    name?: string;
    payload?: { color?: string; fill?: string; label?: string };
    value?: number;
  }>;
};

const TooltipContent = observer((props: TooltipContentProps) => {
  const { active, aggregationType, label, payload } = props;
  const { intlStore } = useRootStore();

  if (!active || !payload || payload.length === 0) return null;

  const isPieChart = payload.length > 0 && payload[0].name && payload[0].name !== "value";

  return (
    <div className={cn("rounded-lg border bg-background p-2 shadow-md")}>
      {label && <div className="mb-1 text-sm font-medium">{String(label)}</div>}

      {payload.map((entry, index) => {
        const value = typeof entry.value === "number" ? entry.value : 0;
        const color = entry.payload?.color || entry.payload?.fill;
        const entryLabel = isPieChart ? entry.name || entry.payload?.label : undefined;
        const formattedValue =
          aggregationType === AggregationType.dealValue
            ? intlStore.formatCurrency(value)
            : intlStore.formatNumber(value);
        return (
          <div key={index} className="flex flex-col gap-1">
            {entryLabel && <span className="text-sm font-medium">{String(entryLabel)}</span>}

            <div className="flex flex-row items-center gap-2">
              {color && <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}

              <span className="text-sm">{formattedValue}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
});

type Props = TooltipProps<number, string> & {
  aggregationType?: AggregationType;
};

export function XChartTooltip({ aggregationType, ...props }: Props) {
  function TooltipContentWithAggregation(tooltipProps: TooltipProps<number, string>) {
    return <TooltipContent aggregationType={aggregationType} {...tooltipProps} />;
  }

  return <Tooltip content={TooltipContentWithAggregation} cursor={false} {...props} />;
}
