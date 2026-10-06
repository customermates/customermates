"use client";

import type { ChartDataPoint } from "./chart.types";

import { observer } from "mobx-react-lite";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { useChartFormatter } from "./use-chart-formatter";

type Props = {
  currency?: string | null;
  chartData: ChartDataPoint[];
  textColor: string;
  reverseXAxis?: boolean;
  reverseYAxis?: boolean;
};

export const HorizontalBarChartWithLabels = observer(
  ({ currency, chartData, textColor, reverseXAxis, reverseYAxis }: Props) => {
    const formatValue = useChartFormatter(currency);
    const rows = reverseYAxis ? [...chartData].reverse() : chartData;
    const minimum = Math.min(0, ...rows.map((row) => row.value));
    const maximum = Math.max(0, ...rows.map((row) => row.value));
    const range = maximum - minimum || 1;
    const zero = (-minimum / range) * 100;

    return (
      <TooltipProvider>
        <div className="h-full min-h-0 overflow-y-auto pr-1" data-slot="widget-bar-list">
          <ul className="flex min-h-full flex-col justify-around gap-2">
            {rows.map((row, index) => {
              const value = row.formattedValue ?? formatValue(row.value);
              const width = (Math.abs(row.value) / range) * 100;
              const start = row.value < 0 ? zero - width : zero;
              return (
                <Tooltip key={`${index}:${row.label}`}>
                  <TooltipTrigger asChild>
                    <li className="min-w-0 space-y-1" data-slot="widget-bar-row">
                      <div className="flex min-w-0 items-baseline justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate text-foreground">{row.label}</span>

                        <span className="shrink-0 font-medium tabular-nums" style={{ color: textColor }}>
                          {value}
                        </span>
                      </div>

                      <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                        <span
                          className="absolute inset-y-0 rounded-full transition-[width,left,right] duration-500 motion-reduce:transition-none"
                          style={{
                            backgroundColor: row.fill,
                            width: `${Math.max(width, row.value === 0 ? 0 : 1)}%`,
                            ...(reverseXAxis ? { right: `${start}%` } : { left: `${start}%` }),
                          }}
                        />
                      </div>
                    </li>
                  </TooltipTrigger>

                  <TooltipContent side="top">
                    <span className="flex items-center gap-2">
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />

                      <span className="font-semibold">{row.label}</span>

                      <span className="tabular-nums">{value}</span>
                    </span>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </ul>
        </div>
      </TooltipProvider>
    );
  },
);
