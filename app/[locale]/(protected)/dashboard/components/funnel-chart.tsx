"use client";

import type { ChartDataPoint } from "./chart.types";

import { observer } from "mobx-react-lite";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  chartData: ChartDataPoint[];
};

export const FunnelChart = observer(({ chartData }: Props) => {
  const widest = Math.max(0, ...chartData.map((point) => point.value));

  return (
    <TooltipProvider>
      <div className="h-full min-h-0 overflow-y-auto pr-1" data-slot="widget-funnel">
        <ol className="grid min-h-full grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] content-around items-center gap-x-3 gap-y-2">
          {chartData.map((step, index) => {
            const width = widest > 0 ? Math.max((step.value / widest) * 100, step.value > 0 ? 2 : 0) : 0;
            return (
              <Tooltip key={`${index}:${step.label}`}>
                <TooltipTrigger asChild>
                  <li className="col-span-3 grid grid-cols-subgrid items-center" data-slot="widget-funnel-step">
                    <span className="truncate text-xs text-foreground">{step.label}</span>

                    <span className="flex h-7 items-center justify-center rounded-md bg-muted/40">
                      <span
                        className="h-full rounded-md transition-[width] duration-500 motion-reduce:transition-none"
                        data-slot="widget-funnel-bar"
                        style={{ backgroundColor: step.fill, width: `${width}%` }}
                      />
                    </span>

                    <span className="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
                      {step.detail ?? step.formattedValue}
                    </span>
                  </li>
                </TooltipTrigger>

                <TooltipContent side="top">
                  <span className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: step.color }} />

                    <span className="font-semibold">{step.label}</span>

                    <span className="tabular-nums">{step.formattedValue ?? step.detail}</span>
                  </span>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </ol>
      </div>
    </TooltipProvider>
  );
});
